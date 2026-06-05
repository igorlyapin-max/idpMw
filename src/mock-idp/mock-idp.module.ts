import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { MockIdpController } from './mock-idp.controller';
import { MockIdpService } from './mock-idp.service';

@Module({
  imports: [HttpModule],
  controllers: [MockIdpController],
  providers: [MockIdpService],
})
export class MockIdpModule {}
