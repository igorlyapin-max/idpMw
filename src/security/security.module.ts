import { Global, Module } from '@nestjs/common';
import { EncryptionService } from './encryption.service';
import { TlsOptionsFactory } from './tls-options.factory';

@Global()
@Module({
  providers: [EncryptionService, TlsOptionsFactory],
  exports: [EncryptionService, TlsOptionsFactory],
})
export class SecurityModule {}
