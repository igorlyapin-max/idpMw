import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { TargetSystemService } from './target-system.service';
import type {
  CreateTargetSystemDto,
  UpdateTargetSystemDto,
} from './target-system.service';
import { ConnectorRegistry } from '../connectors/connector.registry';

@Controller('admin/target-systems')
export class TargetSystemController {
  constructor(
    private readonly service: TargetSystemService,
    private readonly registry: ConnectorRegistry,
  ) {}

  @Get()
  async findAll(
    @Query('type') type?: string,
    @Query('enabled') enabled?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.service.findAll({
      type,
      enabled: enabled !== undefined ? enabled === 'true' : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @Post()
  async create(@Body() dto: CreateTargetSystemDto) {
    const result = await this.service.create(dto);
    await this.registry.reload();
    return result;
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateTargetSystemDto) {
    const result = await this.service.update(id, dto);
    await this.registry.reload();
    return result;
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    const result = await this.service.delete(id);
    await this.registry.reload();
    return result;
  }

  @Post(':id/test')
  async testConnection(@Param('id') id: string) {
    return this.service.testConnection(id);
  }
}
