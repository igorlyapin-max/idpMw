import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from 'crypto';

const ENVELOPE_MARKER = 'idmmw.v1';
const ENVELOPE_ALG = 'AES-256-GCM';
const KEY_BYTES = 32;

export interface EncryptionEnvelope {
  __enc: typeof ENVELOPE_MARKER;
  alg: typeof ENVELOPE_ALG;
  kid: string;
  iv: string;
  tag: string;
  ct: string;
}

export interface EncryptionKeyDescriptor {
  id: string;
  key: Buffer;
}

@Injectable()
export class EncryptionService {
  private keyringCache: Map<string, Buffer> | undefined;

  constructor(private readonly config?: ConfigService) {}

  isEnabled(): boolean {
    return this.readFlag('ENCRYPTION_ENABLED');
  }

  isKafkaEncryptionEnabled(): boolean {
    return this.readFlag('ENCRYPTION_KAFKA_ENABLED', this.isEnabled());
  }

  isIdempotencyHmacEnabled(): boolean {
    return this.readFlag(
      'ENCRYPTION_IDEMPOTENCY_HMAC_ENABLED',
      this.isEnabled(),
    );
  }

  isRotationMode(): boolean {
    return this.readFlag('ENCRYPTION_ROTATION_MODE');
  }

  activeKeyId(): string {
    const activeKeyId = this.readString('ENCRYPTION_ACTIVE_KEY_ID');
    if (activeKeyId) {
      return activeKeyId;
    }
    const fallback = this.readString('ENCRYPTION_KEY_ID');
    if (fallback) {
      return fallback;
    }
    throw new Error(
      'ENCRYPTION_ACTIVE_KEY_ID is required when encryption is enabled',
    );
  }

  keyIds(): string[] {
    const keyIds = this.readString('ENCRYPTION_KEYS');
    if (keyIds?.trim().startsWith('{')) {
      const parsed = JSON.parse(keyIds) as Record<string, string>;
      return Object.keys(parsed);
    }
    const listed = keyIds
      ?.split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
    if (listed?.length) {
      return listed;
    }
    return [this.activeKeyId()];
  }

  validateConfiguration(): void {
    if (!this.isEnabled()) {
      return;
    }

    const keyring = this.keyring();
    const activeKeyId = this.activeKeyId();
    if (!keyring.has(activeKeyId)) {
      throw new Error(
        `Active encryption key '${activeKeyId}' is not present in ENCRYPTION_KEYS/keyring`,
      );
    }
  }

  keyringDescriptors(): EncryptionKeyDescriptor[] {
    return [...this.keyring().entries()].map(([id, key]) => ({ id, key }));
  }

  encryptObject(value: unknown): EncryptionEnvelope {
    const keyId = this.activeKeyId();
    const key = this.requireKey(keyId);
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const plaintext = Buffer.from(JSON.stringify(value), 'utf8');
    const ciphertext = Buffer.concat([
      cipher.update(plaintext),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    return {
      __enc: ENVELOPE_MARKER,
      alg: ENVELOPE_ALG,
      kid: keyId,
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      ct: ciphertext.toString('base64'),
    };
  }

  decryptObject<T = unknown>(value: EncryptionEnvelope): T {
    if (value.__enc !== ENVELOPE_MARKER || value.alg !== ENVELOPE_ALG) {
      throw new Error('Unsupported encryption envelope');
    }

    const key = this.requireKey(value.kid);
    const decipher = createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(value.iv, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(value.tag, 'base64'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(value.ct, 'base64')),
      decipher.final(),
    ]);
    return JSON.parse(plaintext.toString('utf8')) as T;
  }

  encryptForStorage(value: unknown): unknown {
    if (!this.isEnabled()) {
      return value;
    }
    return this.encryptObject(value);
  }

  decryptFromStorage<T = unknown>(value: unknown): T | null {
    if (value === null || value === undefined) {
      return null;
    }
    if (this.isEnvelope(value)) {
      return this.decryptObject<T>(value);
    }
    return value as T;
  }

  encodeKafkaMessage(message: Record<string, unknown>): string {
    if (!this.isKafkaEncryptionEnabled()) {
      return JSON.stringify(message);
    }
    return JSON.stringify(this.encryptObject(message));
  }

  decodeKafkaMessage<T = Record<string, unknown>>(raw: string): T {
    const parsed = JSON.parse(raw) as unknown;
    if (this.isEnvelope(parsed)) {
      return this.decryptObject<T>(parsed);
    }
    return parsed as T;
  }

  idempotencyKeys(sourceKey: string): string[] {
    if (!this.isIdempotencyHmacEnabled()) {
      return [sourceKey];
    }
    const keyring = this.keyringDescriptors();
    const activeKeyId = this.activeKeyId();
    const ordered = [
      ...keyring.filter((item) => item.id === activeKeyId),
      ...keyring.filter((item) => item.id !== activeKeyId),
    ];
    return ordered.map(({ id, key }) => {
      const digest = createHmac('sha256', key).update(sourceKey).digest('hex');
      return `idmmw:hmac:${id}:${digest}`;
    });
  }

  isEnvelope(value: unknown): value is EncryptionEnvelope {
    if (value === null || typeof value !== 'object') {
      return false;
    }
    const candidate = value as Record<string, unknown>;
    return (
      candidate['__enc'] === ENVELOPE_MARKER &&
      candidate['alg'] === ENVELOPE_ALG &&
      typeof candidate['kid'] === 'string' &&
      typeof candidate['iv'] === 'string' &&
      typeof candidate['tag'] === 'string' &&
      typeof candidate['ct'] === 'string'
    );
  }

  private keyring(): Map<string, Buffer> {
    if (this.keyringCache) {
      return this.keyringCache;
    }

    const keys = new Map<string, Buffer>();
    const jsonKeys = this.readString('ENCRYPTION_KEYS');
    if (jsonKeys?.trim().startsWith('{')) {
      const parsed = JSON.parse(jsonKeys) as Record<string, string>;
      for (const [id, value] of Object.entries(parsed)) {
        keys.set(id, this.parseKeyMaterial(id, value));
      }
    } else {
      for (const id of this.keyIds()) {
        const value =
          this.readString(`ENCRYPTION_KEY_${this.envKeySuffix(id)}`) ??
          (id === this.activeKeyId()
            ? this.readString('ENCRYPTION_KEY')
            : undefined);
        if (!value) {
          throw new Error(
            `Missing encryption key material for '${id}'. Set ENCRYPTION_KEY_${this.envKeySuffix(
              id,
            )}`,
          );
        }
        keys.set(id, this.parseKeyMaterial(id, value));
      }
    }

    this.keyringCache = keys;
    return keys;
  }

  private requireKey(keyId: string): Buffer {
    const key = this.keyring().get(keyId);
    if (!key) {
      throw new Error(`Encryption key '${keyId}' is not present in keyring`);
    }
    return key;
  }

  private parseKeyMaterial(keyId: string, value: string): Buffer {
    const trimmed = value.trim();
    if (this.isSecretReference(trimmed)) {
      throw new Error(
        `Encryption key '${keyId}' is still a secret reference. Enable SECRETS_PROVIDER=IndeedPamAapm before encryption startup.`,
      );
    }
    const key = Buffer.from(trimmed, 'base64');
    if (key.length !== KEY_BYTES) {
      throw new Error(
        `Encryption key '${keyId}' must be base64-encoded ${KEY_BYTES} bytes`,
      );
    }
    return key;
  }

  private readFlag(name: string, fallback = false): boolean {
    const value = this.readString(name);
    if (value === undefined) {
      return fallback;
    }
    return value === 'true';
  }

  private readString(name: string): string | undefined {
    const fromProcess = process.env[name];
    if (fromProcess !== undefined) {
      return fromProcess;
    }
    return this.config?.get<string>(name);
  }

  private envKeySuffix(keyId: string): string {
    return keyId.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
  }

  private isSecretReference(value: string): boolean {
    const lower = value.toLowerCase();
    return lower.startsWith('secret://') || lower.startsWith('aapm://');
  }
}
