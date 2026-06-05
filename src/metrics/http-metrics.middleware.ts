import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { MetricsService } from './metrics.service';

@Injectable()
export class HttpMetricsMiddleware implements NestMiddleware {
  constructor(private readonly metrics: MetricsService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const start = Date.now();
    const method = req.method;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const route = (req.route?.path as string | undefined) ?? req.path;

    res.on('finish', () => {
      const duration = (Date.now() - start) / 1000;
      const status = String(res.statusCode);

      this.metrics.httpRequestsTotal.inc({ method, route, status });
      this.metrics.httpRequestDuration.observe({ method, route }, duration);
    });

    next();
  }
}
