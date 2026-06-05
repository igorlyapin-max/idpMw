import { Controller, Get, Post, Param, Query, Logger } from '@nestjs/common';
import { AdminService } from './admin.service';

@Controller('admin')
export class AdminController {
  private readonly logger = new Logger(AdminController.name);

  constructor(private readonly adminService: AdminService) {}

  @Get('dlq')
  async getDlq(
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.adminService.findDlqItems({
      status,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
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
