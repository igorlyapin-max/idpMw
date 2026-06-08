import { Global, Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AdminAuthMiddleware } from './admin-auth.middleware';

@Global()
@Module({
  controllers: [AuthController],
  providers: [AuthService, AdminAuthMiddleware],
  exports: [AuthService, AdminAuthMiddleware],
})
export class AuthModule {}
