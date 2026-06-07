import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { EncryptionService } from '../security/encryption.service';

interface EncryptionStateRow {
  enabled: boolean | number;
  activeKeyId: string;
  previousKeyIds: string;
  rotationStatus: string;
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor(private readonly encryption: EncryptionService) {
    super();
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    await this.validateEncryptionState();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  private async validateEncryptionState(): Promise<void> {
    const enabled = this.encryption.isEnabled();
    if (enabled) {
      this.encryption.validateConfiguration();
    }

    const state = await this.loadEncryptionState(enabled);
    if (!enabled) {
      if (state && this.toBoolean(state.enabled)) {
        throw new Error(
          'Encryption is enabled in database state, but ENCRYPTION_ENABLED is not true',
        );
      }
      return;
    }

    const activeKeyId = this.encryption.activeKeyId();
    if (!state) {
      await this.ensureStrictlyEmptyForEncryption();
      await this.createEncryptionState(activeKeyId);
      this.logger.log(
        `Encryption state initialized with active key '${activeKeyId}'`,
      );
      return;
    }

    if (!this.toBoolean(state.enabled)) {
      throw new Error(
        'Encryption state exists but is disabled; refusing encrypted startup',
      );
    }

    const keyringIds = new Set(
      this.encryption.keyringDescriptors().map((key) => key.id),
    );
    if (!keyringIds.has(state.activeKeyId)) {
      throw new Error(
        `Database encryption key '${state.activeKeyId}' is not present in runtime keyring`,
      );
    }

    if (
      state.activeKeyId !== activeKeyId &&
      !this.encryption.isRotationMode()
    ) {
      throw new Error(
        `Encryption active key mismatch: database uses '${state.activeKeyId}', runtime uses '${activeKeyId}'. Run key rotation before normal startup.`,
      );
    }
  }

  private async loadEncryptionState(
    required: boolean,
  ): Promise<EncryptionStateRow | undefined> {
    try {
      const rows = await this.$queryRaw<EncryptionStateRow[]>`
        SELECT "enabled", "activeKeyId", "previousKeyIds", "rotationStatus"
        FROM "EncryptionState"
        WHERE "id" = 'default'
        LIMIT 1
      `;
      return rows[0];
    } catch (error: unknown) {
      if (this.isMissingEncryptionStateTable(error) && !required) {
        return undefined;
      }
      if (this.isMissingEncryptionStateTable(error) && required) {
        throw new Error(
          'ENCRYPTION_ENABLED=true requires the EncryptionState migration to be applied',
        );
      }
      throw error;
    }
  }

  private async ensureStrictlyEmptyForEncryption(): Promise<void> {
    const [auditLogs, dlqItems, targetSystems, activeIdempotencyKeys] =
      await Promise.all([
        this.countRows('AuditLog'),
        this.countRows('DlqItem'),
        this.countRows('TargetSystem'),
        this.countActiveIdempotencyKeys(),
      ]);
    const nonEmpty = {
      AuditLog: auditLogs,
      DlqItem: dlqItems,
      TargetSystem: targetSystems,
      IdempotencyKey: activeIdempotencyKeys,
    };
    const offenders = Object.entries(nonEmpty)
      .filter(([, count]) => count > 0)
      .map(([name, count]) => `${name}=${count}`);
    if (offenders.length > 0) {
      throw new Error(
        `Cannot enable encryption on a non-empty system: ${offenders.join(', ')}`,
      );
    }
  }

  private async createEncryptionState(activeKeyId: string): Promise<void> {
    const now = new Date();
    await this.$executeRaw`
      INSERT INTO "EncryptionState"
        ("id", "enabled", "activeKeyId", "previousKeyIds", "rotationStatus", "createdAt", "updatedAt")
      VALUES
        ('default', true, ${activeKeyId}, '[]', 'completed', ${now}, ${now})
    `;
  }

  private async countRows(table: string): Promise<number> {
    const rows = await this.$queryRawUnsafe<
      Array<{ count: bigint | number | string }>
    >(`SELECT COUNT(*) AS count FROM "${table}"`);
    return this.parseCount(rows[0]?.count);
  }

  private async countActiveIdempotencyKeys(): Promise<number> {
    const rows = await this.$queryRaw<
      Array<{ count: bigint | number | string }>
    >`
      SELECT COUNT(*) AS count FROM "IdempotencyKey" WHERE "expiresAt" > ${new Date()}
    `;
    return this.parseCount(rows[0]?.count);
  }

  private parseCount(value: bigint | number | string | undefined): number {
    if (typeof value === 'bigint') {
      return Number(value);
    }
    if (typeof value === 'number') {
      return value;
    }
    return Number(value ?? 0);
  }

  private toBoolean(value: boolean | number): boolean {
    return value === true || value === 1;
  }

  private isMissingEncryptionStateTable(error: unknown): boolean {
    const msg = error instanceof Error ? error.message : String(error);
    return (
      msg.includes('EncryptionState') &&
      (msg.includes('does not exist') ||
        msg.includes('no such table') ||
        msg.includes('UndefinedTable'))
    );
  }
}
