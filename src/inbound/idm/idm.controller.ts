import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { TargetSystemService } from '../../admin/target-system.service';
import { ConnectorRegistry } from '../../connectors/connector.registry';
import { createConnectorCapabilities } from '../../connectors/connector.capabilities';
import type { ConnectorCapabilities } from '../../connectors/connector.interface';

interface TargetSystemRecord {
  name: string;
  type: string;
  label?: string | null;
  enabled: boolean;
}

interface IdmTargetSystemCatalogItem {
  name: string;
  type: string;
  label?: string | null;
  enabled: boolean;
  operations: string[];
  readOperations: string[];
  writeOperations: string[];
  capabilities: ConnectorCapabilities['capabilities'];
  operationStatus: ConnectorCapabilities['operationStatus'];
  partialOperations?: Record<string, string>;
}

@Controller('idm')
export class IdmController {
  constructor(
    private readonly targetSystemService: TargetSystemService,
    private readonly registry: ConnectorRegistry,
  ) {}

  @Get('target-systems')
  async listTargetSystems(): Promise<IdmTargetSystemCatalogItem[]> {
    const systems = await this.targetSystemService.findAll({
      enabled: true,
      limit: 1000,
      offset: 0,
    });
    return systems
      .map((system) => this.toCatalogItem(system))
      .filter((system): system is IdmTargetSystemCatalogItem =>
        Boolean(system),
      );
  }

  @Get('target-systems/:name')
  async getTargetSystem(
    @Param('name') name: string,
  ): Promise<IdmTargetSystemCatalogItem> {
    const system = await this.targetSystemService.findByName(name);
    if (!system?.enabled) {
      throw new NotFoundException(`Target system not found: ${name}`);
    }

    const catalogItem = this.toCatalogItem(system);
    if (!catalogItem) {
      throw new NotFoundException(`Target system not found: ${name}`);
    }
    return catalogItem;
  }

  @Get(':targetSystem/test')
  async testTargetSystem(@Param('targetSystem') name: string) {
    const result = await this.executeRead(name, 'system.test', {});
    return result.data;
  }

  @Get(':targetSystem/users')
  async listUsers(
    @Param('targetSystem') name: string,
    @Query('filter') filter?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.executeRead(name, 'user.search', {
      filter,
      limit: limit ? parseInt(limit, 10) : 50,
    });
    return result.data;
  }

  @Get(':targetSystem/users/resolve')
  async resolveUser(
    @Param('targetSystem') name: string,
    @Query('username') username?: string,
    @Query('login') login?: string,
    @Query('filter') filter?: string,
  ) {
    const result = await this.executeRead(name, 'user.resolve', {
      username,
      login,
      filter,
    });
    return result.data;
  }

  @Get(':targetSystem/users/:id')
  async getUser(@Param('targetSystem') name: string, @Param('id') id: string) {
    const result = await this.executeRead(name, 'user.get', { id });
    return result.data;
  }

  @Get(':targetSystem/groups')
  async listGroups(
    @Param('targetSystem') name: string,
    @Query('filter') filter?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.executeRead(name, 'group.search', {
      filter,
      limit: limit ? parseInt(limit, 10) : 50,
    });
    return result.data;
  }

  @Get(':targetSystem/groups/:id')
  async getGroup(@Param('targetSystem') name: string, @Param('id') id: string) {
    const result = await this.executeRead(name, 'group.get', { id });
    return result.data;
  }

  @Get(':targetSystem/schema')
  async getSchema(@Param('targetSystem') name: string) {
    const result = await this.executeRead(name, 'schema.get', {});
    return result.data;
  }

  @Post(':targetSystem/sync')
  async sync(
    @Param('targetSystem') name: string,
    @Body() body: { mode?: 'full' | 'incremental' },
  ) {
    const mode = body.mode ?? 'full';
    const result = await this.executeRead(
      name,
      mode === 'incremental' ? 'sync.incremental' : 'sync.full',
      {},
    );
    return result.data;
  }

  private async executeRead(
    name: string,
    operation: string,
    params: Record<string, unknown>,
  ) {
    const ts = await this.targetSystemService.findByName(name);
    const connector = this.registry.get(name);
    if (!connector) {
      throw new NotFoundException(`Target system not found: ${name}`);
    }

    const result = await connector.execute({
      operation,
      targetSystem: name,
      payload: {
        ...(ts ? { config: ts.config } : {}),
        params,
      },
    });

    if (!result.success) {
      throw new BadRequestException(result.error ?? 'Connector failed');
    }
    return result;
  }

  private toCatalogItem(
    system: TargetSystemRecord,
  ): IdmTargetSystemCatalogItem | null {
    const connector = this.registry.get(system.name);
    if (!connector) {
      return null;
    }

    const connectorCapabilities =
      connector.getCapabilities?.() ?? createConnectorCapabilities();

    return {
      name: system.name,
      type: system.type,
      label: system.label,
      enabled: system.enabled,
      operations: connectorCapabilities.operations,
      readOperations: connectorCapabilities.readOperations,
      writeOperations: connectorCapabilities.writeOperations,
      capabilities: connectorCapabilities.capabilities,
      operationStatus: connectorCapabilities.operationStatus,
      ...(connectorCapabilities.partialOperations
        ? { partialOperations: connectorCapabilities.partialOperations }
        : {}),
    };
  }
}
