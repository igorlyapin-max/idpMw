import { Global, Module } from '@nestjs/common';
import { DiagnosticLoggerService } from './diagnostic-logger.service';

@Global()
@Module({
  providers: [DiagnosticLoggerService],
  exports: [DiagnosticLoggerService],
})
export class DiagnosticsModule {}
