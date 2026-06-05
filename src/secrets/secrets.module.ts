import { Global, Module, OnModuleInit } from '@nestjs/common';

import { SecretResolverService } from './secret-resolver.service';
import { IndeedPamAapmClient } from './indeed-pam-aapm.client';

@Global()
@Module({
  providers: [SecretResolverService, IndeedPamAapmClient],
  exports: [SecretResolverService, IndeedPamAapmClient],
})
export class SecretsModule implements OnModuleInit {
  constructor(private readonly resolver: SecretResolverService) {}

  async onModuleInit(): Promise<void> {
    await this.resolver.resolveAll();
  }
}
