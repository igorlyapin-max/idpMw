import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { JsonHelper } from './json.helper';

@Global()
@Module({
  providers: [PrismaService, JsonHelper],
  exports: [PrismaService, JsonHelper],
})
export class PrismaModule {}
