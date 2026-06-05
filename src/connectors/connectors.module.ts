import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConnectorRegistry } from './connector.registry';
import { RestConnectorService } from './implementations/rest-connector/rest-connector.service';
import { DbConnectorService } from './implementations/db-connector/db-connector.service';

@Module({
  imports: [HttpModule],
  providers: [ConnectorRegistry, RestConnectorService, DbConnectorService],
  exports: [ConnectorRegistry],
})
export class ConnectorsModule {}
