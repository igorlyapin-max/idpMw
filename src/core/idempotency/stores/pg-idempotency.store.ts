import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { IdempotencyStore } from '../idempotency.store.interface';

@Injectable()
export class PgIdempotencyStore implements IdempotencyStore {
  constructor(private readonly prisma: PrismaService) {}

  async exists(key: string): Promise<boolean> {
    const row = await this.prisma.idempotencyKey.findUnique({
      where: { key },
      select: { key: true },
    });
    return row !== null;
  }

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
