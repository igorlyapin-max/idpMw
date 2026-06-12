import { Global, Module } from '@nestjs/common';
import { EncryptionService } from './encryption.service';
import { TlsOptionsFactory } from './tls-options.factory';
import { IntegrationAuthService } from './integration-auth.service';
import { IntegrationAuthMiddleware } from './integration-auth.middleware';

@Global()
@Module({
  providers: [
    EncryptionService,
    TlsOptionsFactory,
    IntegrationAuthService,
    IntegrationAuthMiddleware,
  ],
  exports: [
    EncryptionService,
    TlsOptionsFactory,
    IntegrationAuthService,
    IntegrationAuthMiddleware,
  ],
})
export class SecurityModule {}
