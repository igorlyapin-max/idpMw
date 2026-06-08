import { Controller, Get, NotFoundException, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { join } from 'path';
import type { Response } from 'express';

@Controller()
export class AdminUiController {
  private readonly indexFilePath = join(
    __dirname,
    '..',
    '..',
    'ui',
    'dist',
    'index.html',
  );

  constructor(private readonly config: ConfigService) {}

  @Get('target-systems')
  serveTargetSystems(@Res() res: Response): void {
    const adminUiEnabled =
      this.config.get<boolean>('ADMIN_UI_ENABLED') ?? false;
    if (!adminUiEnabled) {
      throw new NotFoundException('Admin UI is disabled');
    }

    res.sendFile(this.indexFilePath);
  }
}
