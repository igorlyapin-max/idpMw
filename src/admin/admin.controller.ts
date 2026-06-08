import {
  Body,
  Controller,
  Get,
  Post,
  Param,
  Query,
  Logger,
} from '@nestjs/common';
import { AdminService } from './admin.service';

interface RetryManyBody {
  targetSystem?: string;
  status?: string;
  limit?: number;
}

@Controller('admin')
export class AdminController {
  private readonly logger = new Logger(AdminController.name);

  constructor(private readonly adminService: AdminService) {}

  @Get('stats')
  async getStats() {
    return this.adminService.stats();
  }

  @Get('dlq')
  async getDlq(
    @Query('status') status?: string,
    @Query('targetSystem') targetSystem?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.adminService.findDlqItems({
      status,
      targetSystem,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Post('dlq/retry')
  async retryMany(@Body() body: RetryManyBody) {
    this.logger.log(
      `Retrying DLQ items target=${body.targetSystem ?? 'all'} limit=${body.limit ?? 25}`,
    );
    return this.adminService.retryMany(body);
  }

  @Post('dlq/:id/retry')
  async retry(@Param('id') id: string) {
    this.logger.log(`Retrying DLQ item ${id}`);
    await this.adminService.retry(id);
    return { success: true };
  }

  @Post('dlq/:id/skip')
  async skip(@Param('id') id: string) {
    this.logger.log(`Skipping DLQ item ${id}`);
    await this.adminService.skip(id);
    return { success: true };
  }
}
