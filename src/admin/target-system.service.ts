import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { JsonHelper } from '../database/json.helper';
import { ConnectorRegistry } from '../connectors/connector.registry';
import type {
  CreateTargetSystemDto,
  UpdateTargetSystemDto,
} from './dto/target-system.dto';

@Injectable()
export class TargetSystemService {
  private readonly logger = new Logger(TargetSystemService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jsonHelper: JsonHelper,
    private readonly registry: ConnectorRegistry,
  ) {}

  async findAll(params: {
    type?: string;
    enabled?: boolean;
    limit?: number;
    offset?: number;
  }) {
    const items = await this.prisma.targetSystem.findMany({
      where: {
        ...(params.type ? { type: params.type } : {}),
        ...(params.enabled !== undefined ? { enabled: params.enabled } : {}),
      },
      take: params.limit ?? 50,
      skip: params.offset ?? 0,
      orderBy: { createdAt: 'desc' },
    });
    return items.map((item) => ({
      ...item,
      config: this.jsonHelper.fromJson<Record<string, unknown>>(item.config),
    }));
  }

  async findById(id: string) {
    const item = await this.prisma.targetSystem.findUnique({ where: { id } });
    if (!item) return null;
    return {
      ...item,
      config: this.jsonHelper.fromJson<Record<string, unknown>>(item.config),
    };
  }

  async findByName(name: string) {
    const item = await this.prisma.targetSystem.findUnique({ where: { name } });
    if (!item) return null;
    return {
      ...item,
      config: this.jsonHelper.fromJson<Record<string, unknown>>(item.config),
    };
  }

  async create(dto: CreateTargetSystemDto) {
    try {
      const item = await this.prisma.targetSystem.create({
        data: {
          name: dto.name,
          type: dto.type,
          label: dto.label,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          config: this.jsonHelper.toJson(dto.config) as any,
          enabled: dto.enabled ?? true,
        },
      });
      return {
        ...item,
        config: this.jsonHelper.fromJson<Record<string, unknown>>(item.config),
      };
    } catch (error: unknown) {
      this.handlePrismaMutationError(error);
    }
  }

  async update(id: string, dto: UpdateTargetSystemDto) {
    try {
      const item = await this.prisma.targetSystem.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.type !== undefined ? { type: dto.type } : {}),
          ...(dto.label !== undefined ? { label: dto.label } : {}),
          ...(dto.config !== undefined
            ? {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                config: this.jsonHelper.toJson(dto.config) as any,
              }
            : {}),
          ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
        },
      });
      return {
        ...item,
        config: this.jsonHelper.fromJson<Record<string, unknown>>(item.config),
      };
    } catch (error: unknown) {
      this.handlePrismaMutationError(error);
    }
  }

  async delete(id: string) {
    try {
      const item = await this.prisma.targetSystem.delete({ where: { id } });
      return {
        ...item,
        config: this.jsonHelper.fromJson<Record<string, unknown>>(item.config),
      };
    } catch (error: unknown) {
      this.handlePrismaMutationError(error);
    }
  }

  async testConnection(
    id: string,
  ): Promise<{ success: boolean; message: string }> {
    const ts = await this.prisma.targetSystem.findUnique({ where: { id } });
    if (!ts) {
      return { success: false, message: 'TargetSystem not found' };
    }
    const config =
      this.jsonHelper.fromJson<Record<string, unknown>>(ts.config) ?? {};
    return this.registry.testConnection(ts.type, config);
  }

  private handlePrismaMutationError(error: unknown): never {
    if (this.isPrismaError(error, 'P2002')) {
      throw new ConflictException('TargetSystem name already exists');
    }

    if (this.isPrismaError(error, 'P2025')) {
      throw new NotFoundException('TargetSystem not found');
    }

    throw error;
  }

  private isPrismaError(error: unknown, code: string): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === code
    );
  }
}
