import { Injectable } from '@nestjs/common';
import { Connector } from './connector.interface';
import { RestConnectorService } from './implementations/rest-connector/rest-connector.service';
import { DbConnectorService } from './implementations/db-connector/db-connector.service';

@Injectable()
export class ConnectorRegistry {
  private readonly connectors = new Map<string, Connector>();

  constructor(
    private readonly restConnector: RestConnectorService,
    private readonly dbConnector: DbConnectorService,
  ) {
    this.register(this.restConnector);
    this.register(this.dbConnector);
  }

  private register(connector: Connector): void {
    this.connectors.set(connector.name, connector);
  }

  get(name: string): Connector | undefined {
    return this.connectors.get(name);
  }
}
