import { Injectable } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { IntegrationAuthService } from './integration-auth.service';

@Injectable()
export class IntegrationAuthMiddleware {
  constructor(private readonly integrationAuth: IntegrationAuthService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    if (!this.integrationAuth.requiresAuth(req)) {
      next();
      return;
    }

    const result = this.integrationAuth.verify(req);
    if (result.ok) {
      next();
      return;
    }

    res.status(result.status).json({
      success: false,
      message: result.message,
    });
  }
}
