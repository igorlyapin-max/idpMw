import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiResponse, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { TargetSystemService } from './target-system.service';
import {
  CreateTargetSystemDto,
  UpdateTargetSystemDto,
} from './dto/target-system.dto';
import { ConnectorRegistry } from '../connectors/connector.registry';

@ApiTags('Target Systems')
@Controller('admin/target-systems')
export class TargetSystemController {
  constructor(
    private readonly service: TargetSystemService,
    private readonly registry: ConnectorRegistry,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List target systems' })
  @ApiQuery({ name: 'type', required: false })
  @ApiQuery({ name: 'enabled', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'offset', required: false })
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

  @Get('name/:name')
  @ApiOperation({ summary: 'Get target system by name' })
  @ApiResponse({ status: 200, description: 'Found' })
  @ApiResponse({ status: 404, description: 'Not found' })
  async findByName(@Param('name') name: string) {
    const ts = await this.service.findByName(name);
    if (!ts) return { success: false, message: 'Not found' };
    return ts;
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get target system by ID' })
  @ApiResponse({ status: 200, description: 'Found' })
  @ApiResponse({ status: 404, description: 'Not found' })
  async findById(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create target system' })
  @ApiResponse({ status: 201, description: 'Created' })
  async create(@Body() dto: CreateTargetSystemDto) {
    const result = await this.service.create(dto);
    await this.registry.reload();
    return result;
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update target system' })
  @ApiResponse({ status: 200, description: 'Updated' })
  async update(@Param('id') id: string, @Body() dto: UpdateTargetSystemDto) {
    const result = await this.service.update(id, dto);
    await this.registry.reload();
    return result;
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete target system' })
  @ApiResponse({ status: 200, description: 'Deleted' })
  async delete(@Param('id') id: string) {
    const result = await this.service.delete(id);
    await this.registry.reload();
    return result;
  }

  @Post(':id/test')
  @HttpCode(200)
  @ApiOperation({ summary: 'Test connection to target system' })
  @ApiResponse({ status: 200, description: 'Test result' })
  async testConnection(@Param('id') id: string) {
    return this.service.testConnection(id);
  }
}
