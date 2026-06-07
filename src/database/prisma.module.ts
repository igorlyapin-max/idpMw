import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { JsonHelper } from './json.helper';
import { SecurityModule } from '../security/security.module';

@Global()
@Module({
  imports: [SecurityModule],
  providers: [PrismaService, JsonHelper],
  exports: [PrismaService, JsonHelper],
})
export class PrismaModule {}
