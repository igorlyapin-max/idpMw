import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EncryptionService } from '../security/encryption.service';

@Injectable()
export class JsonHelper {
  private readonly isSqlite: boolean;

  constructor(
    private readonly config: ConfigService,
    private readonly encryption: EncryptionService,
  ) {
    this.isSqlite = this.config.get<string>('DATABASE_PROVIDER') === 'sqlite';
  }

  toJson(value: unknown): unknown {
    const stored = this.encryption.encryptForStorage(value);
    if (this.isSqlite) {
      return JSON.stringify(stored);
    }
    return stored;
  }

  fromJson<T = unknown>(value: unknown): T | null {
    if (value === null) {
      return null;
    }
    const parsed = this.isSqlite
      ? (JSON.parse(value as string) as unknown)
      : value;
    return this.encryption.decryptFromStorage<T>(parsed);
  }
}
