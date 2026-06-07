import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { PrismaModule } from '../database/prisma.module';
import { CoreModule } from '../core/core.module';

@Module({
  imports: [TerminusModule, PrismaModule, CoreModule],
  controllers: [HealthController],
})
export class HealthModule {}
