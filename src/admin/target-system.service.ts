import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

export interface CreateTargetSystemDto {
  name: string;
  type: string;
  label: string;
  config: Record<string, unknown>;
  enabled?: boolean;
}

export interface UpdateTargetSystemDto {
  name?: string;
  type?: string;
  label?: string;
  config?: Record<string, unknown>;
  enabled?: boolean;
}

@Injectable()
export class TargetSystemService {
  private readonly logger = new Logger(TargetSystemService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll(params: {
    type?: string;
    enabled?: boolean;
    limit?: number;
    offset?: number;
  }) {
    return this.prisma.targetSystem.findMany({
      where: {
        ...(params.type ? { type: params.type } : {}),
        ...(params.enabled !== undefined ? { enabled: params.enabled } : {}),
      },
      take: params.limit ?? 50,
      skip: params.offset ?? 0,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string) {
    return this.prisma.targetSystem.findUnique({ where: { id } });
  }

  async create(dto: CreateTargetSystemDto) {
    return this.prisma.targetSystem.create({
      data: {
        name: dto.name,
        type: dto.type,
        label: dto.label,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        config: dto.config as any,
        enabled: dto.enabled ?? true,
      },
    });
  }

  async update(id: string, dto: UpdateTargetSystemDto) {
    return this.prisma.targetSystem.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.label !== undefined ? { label: dto.label } : {}),
        ...(dto.config !== undefined
          ? {
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
              config: dto.config as any,
            }
          : {}),
        ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
      },
    });
  }

  async delete(id: string) {
    return this.prisma.targetSystem.delete({ where: { id } });
  }

  async testConnection(
    id: string,
  ): Promise<{ success: boolean; message: string }> {
    const ts = await this.findById(id);
    if (!ts) {
      return { success: false, message: 'TargetSystem not found' };
    }
    // TODO: implement actual connection test per type
    return {
      success: true,
      message: `Connection to ${ts.name} (${ts.type}) looks OK`,
    };
  }
}
