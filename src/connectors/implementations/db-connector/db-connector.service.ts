import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import knex, { Knex } from 'knex';
import {
  Connector,
  ConnectorPayload,
  ConnectorResult,
} from '../../connector.interface';

@Injectable()
export class DbConnectorService
  implements Connector, OnModuleInit, OnModuleDestroy
{
  readonly name = 'db';
  private readonly logger = new Logger(DbConnectorService.name);
  private knex: Knex | undefined;

  constructor(private readonly config: ConfigService) {}

  // eslint-disable-next-line @typescript-eslint/require-await
  async onModuleInit(): Promise<void> {
    const enabled = this.config.get<boolean>('DB_CONNECTOR_ENABLED') ?? false;
    if (!enabled) {
      this.logger.log('DB connector is disabled');
      return;
    }

    const client = this.config.get<string>('DB_CONNECTOR_DIALECT');
    const connection = this.config.get<string>('DB_CONNECTOR_URL');

    if (!client || !connection) {
      this.logger.error(
        'DB_CONNECTOR_DIALECT and DB_CONNECTOR_URL are required when DB_CONNECTOR_ENABLED=true',
      );
      return;
    }

    this.knex = knex({
      client,
      connection,
      pool: { min: 1, max: 5 },
    });

    this.logger.log(`DB connector initialized with dialect: ${client}`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.knex?.destroy();
  }

  async execute(payload: ConnectorPayload): Promise<ConnectorResult> {
    if (!this.knex) {
      return { success: false, error: 'DB connector not initialized' };
    }

    const operation = payload.payload['sqlOperation'] as string | undefined;
    const table = payload.payload['table'] as string | undefined;
    const data = payload.payload['data'] as Record<string, unknown> | undefined;
    const where = payload.payload['where'] as
      | Record<string, unknown>
      | undefined;
    const rawQuery = payload.payload['rawQuery'] as string | undefined;
    const bindings = payload.payload['bindings'] as unknown[] | undefined;

    try {
      if (rawQuery) {
        // @ts-expect-error knex raw bindings type mismatch
        const result: unknown = await this.knex.raw(rawQuery, bindings ?? []);
        return { success: true, data: result };
      }

      if (!table) {
        return {
          success: false,
          error: 'Missing table or rawQuery in payload',
        };
      }

      switch (operation) {
        case 'insert': {
          const result = await this.knex(table).insert(data);
          return { success: true, data: result };
        }
        case 'update': {
          if (!where) {
            return { success: false, error: 'Missing where clause for update' };
          }
          const result = await this.knex(table).where(where).update(data);
          return { success: true, data: result };
        }
        case 'delete': {
          if (!where) {
            return { success: false, error: 'Missing where clause for delete' };
          }
          const result = await this.knex(table).where(where).del();
          return { success: true, data: result };
        }
        case 'query': {
          const result = await this.knex(table).where(where ?? {});
          return { success: true, data: result };
        }
        default:
          return {
            success: false,
            error: `Unsupported SQL operation: ${operation}`,
          };
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`DB operation failed: ${msg}`);
      return { success: false, error: msg };
    }
  }

  async testConnection(
    config: Record<string, unknown>,
  ): Promise<{ success: boolean; message: string }> {
    const client = config['client'] as string | undefined;
    const connection = config['connection'] as string | undefined;
    if (!client || !connection) {
      return {
        success: false,
        message: 'Missing client or connection in config',
      };
    }

    let testKnex: ReturnType<typeof import('knex').default> | undefined;
    try {
      testKnex = (await import('knex')).default({
        client,
        connection,
        pool: { min: 1, max: 2 },
      });
      await testKnex.raw('SELECT 1');
      return { success: true, message: 'DB connection OK' };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, message: `DB connection failed: ${msg}` };
    } finally {
      await testKnex?.destroy();
    }
  }
}
