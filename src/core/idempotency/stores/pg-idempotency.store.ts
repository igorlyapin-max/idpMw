import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { IdempotencyStore } from '../idempotency.store.interface';

@Injectable()
export class PgIdempotencyStore implements IdempotencyStore {
  constructor(private readonly prisma: PrismaService) {}

  async exists(key: string): Promise<boolean> {
    const row = await this.prisma.idempotencyKey.findUnique({
      where: { key },
      select: { expiresAt: true },
    });
    return row !== null && row.expiresAt > new Date();
  }

  async setIfNotExists(key: string, ttlSeconds: number): Promise<boolean> {
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.idempotencyKey.findUnique({
          where: { key },
          select: { expiresAt: true },
        });
        if (existing && existing.expiresAt > new Date()) {
          return false;
        }
        await tx.idempotencyKey.upsert({
          where: { key },
          create: { key, expiresAt },
          update: { expiresAt, lockedAt: new Date() },
        });
        await tx.idempotencyKey.deleteMany({
          where: {
            expiresAt: {
              lt: new Date(Date.now() - 60_000),
            },
          },
        });
        return true;
      });
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
