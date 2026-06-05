import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { JsonHelper } from '../../database/json.helper';

export interface DlqItemData {
  eventId: string;
  operation: string;
  targetSystem: string;
  payload: Record<string, unknown>;
  error: string;
  retryCount?: number;
}

@Injectable()
export class DlqService {
  private readonly logger = new Logger(DlqService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jsonHelper: JsonHelper,
  ) {}

  async add(item: DlqItemData): Promise<void> {
    await this.prisma.dlqItem.create({
      data: {
        eventId: item.eventId,
        operation: item.operation,
        targetSystem: item.targetSystem,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        payload: this.jsonHelper.toJson(item.payload) as any,
        error: item.error,
        retryCount: item.retryCount ?? 0,
        status: 'pending',
      },
    });
    this.logger.log(`Event ${item.eventId} moved to DLQ`);
  }

  async retry(id: string): Promise<void> {
    await this.prisma.dlqItem.update({
      where: { id },
      data: { status: 'retrying', retryCount: { increment: 1 } },
    });
  }

  async skip(id: string): Promise<void> {
    await this.prisma.dlqItem.update({
      where: { id },
      data: { status: 'skipped' },
    });
  }
}
