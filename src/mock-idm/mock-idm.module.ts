import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { MockIdmController } from './mock-idm.controller';
import { MockIdmService } from './mock-idm.service';

@Module({
  imports: [HttpModule],
  controllers: [MockIdmController],
  providers: [MockIdmService],
})
export class MockIdmModule {}
