import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { SecurityCliModule } from './security-cli.module';
import { EncryptionRotationService } from './encryption-rotation.service';

async function main(): Promise<void> {
  process.env['ENCRYPTION_ROTATION_MODE'] = 'true';
  const app = await NestFactory.createApplicationContext(SecurityCliModule, {
    bufferLogs: true,
  });
  const logger = new Logger('RotateEncryptionKeyCli');

  try {
    await app.get(EncryptionRotationService).rotateToActiveKey();
    logger.log('Encryption key rotation finished');
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  const msg = error instanceof Error ? error.message : String(error);
  console.error(`Encryption key rotation failed: ${msg}`);
  process.exitCode = 1;
});
