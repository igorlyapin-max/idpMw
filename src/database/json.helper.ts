import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JsonHelper {
  private readonly isSqlite: boolean;

  constructor(private readonly config: ConfigService) {
    this.isSqlite = this.config.get<string>('DATABASE_PROVIDER') === 'sqlite';
  }

  toJson(value: unknown): unknown {
    if (this.isSqlite) {
      return JSON.stringify(value);
    }
    return value;
  }

  fromJson<T = unknown>(value: unknown): T | null {
    if (!this.isSqlite || value === null) {
      return value as T | null;
    }
    return JSON.parse(value as string) as T;
  }
}
