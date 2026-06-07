import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, catchError, tap } from 'rxjs';
import { PrismaService } from '../../database/prisma.service';
import { JsonHelper } from '../../database/json.helper';
import type { Request } from 'express';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jsonHelper: JsonHelper,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const method = request.method;
    const url = request.url;
    const body = request.body as Record<string, unknown> | undefined;
    const eventId = (body?.eventId as string) ?? 'unknown';
    const operation = (body?.operation as string) ?? 'unknown';
    const targetSystem = (body?.targetSystem as string) ?? 'unknown';
    const start = Date.now();

    return next.handle().pipe(
      tap((response: unknown) => {
        void this.prisma.auditLog
          .create({
            data: {
              eventId: `${eventId}-${Date.now()}`,
              source: 'avanpost',
              operation,
              targetSystem,
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
              payload: this.jsonHelper.toJson({
                request: body,
                method,
                url,
              }) as any,
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
              response: this.jsonHelper.toJson({ response }) as any,
              status: 'success',
            },
          })
          .then(() => {
            this.logger.log(
              `Audit: ${method} ${url} — ${Date.now() - start}ms`,
            );
          })
          .catch(() => {
            // ignore audit write errors
          });
      }),
      catchError((error: unknown) => {
        const err = error instanceof Error ? error : new Error(String(error));
        void this.prisma.auditLog
          .create({
            data: {
              eventId: `${eventId}-${Date.now()}`,
              source: 'avanpost',
              operation,
              targetSystem,
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
              payload: this.jsonHelper.toJson({
                request: body,
                method,
                url,
              }) as any,
              status: 'error',
              errorMessage: err.message,
            },
          })
          .then(() => {
            this.logger.error(`Audit error: ${method} ${url} — ${err.message}`);
          })
          .catch(() => {
            // ignore audit write errors
          });
        throw error;
      }),
    );
  }
}
