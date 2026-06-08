import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import type { SessionStatus } from './auth.service';

interface LoginBody {
  username?: string;
  password?: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Get('session')
  session(@Req() req: Request): SessionStatus {
    return this.auth.sessionStatus(req);
  }

  @Post('login')
  login(
    @Body() body: LoginBody,
    @Res({ passthrough: true }) res: Response,
  ): SessionStatus {
    return this.auth.loginLocal(body.username ?? '', body.password ?? '', res);
  }

  @Post('sso-login')
  ssoLogin(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): SessionStatus {
    return this.auth.loginSso(req, res);
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response): { success: true } {
    this.auth.logout(res);
    return { success: true };
  }
}
