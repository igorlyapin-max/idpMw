import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { IdempotencyStore } from '../idempotency.store.interface';

@Injectable()
export class PgIdempotencyStore implements IdempotencyStore {
  constructor(private readonly prisma: PrismaService) {}

  async setIfNotExists(key: string, ttlSeconds: number): Promise<boolean> {
    try {
      await this.prisma.idempotencyKey.create({
        data: {
          key,
          expiresAt: new Date(Date.now() + ttlSeconds * 1000),
        },
      });
      return true;
    } catch {
      return false;
    }
  }

  async delete(key: string): Promise<void> {
    await this.prisma.idempotencyKey.delete({ where: { key } }).catch(() => {
      // ignore not found
    });
  }
}
