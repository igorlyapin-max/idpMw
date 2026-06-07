import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'fs';
import { Agent as HttpsAgent } from 'https';
import type { AxiosRequestConfig } from 'axios';
import type { KafkaConfig } from 'kafkajs';
import type { RedisOptions } from 'ioredis';
import type { ServerOptions } from 'https';

export interface TlsConnectionConfig {
  enabled?: boolean | string;
  verify?: boolean | string;
  rejectUnauthorized?: boolean | string;
  ca?: string;
  caPath?: string;
  cert?: string;
  certPath?: string;
  key?: string;
  keyPath?: string;
  serverName?: string;
  requestClientCert?: boolean | string;
}

export interface DbConnectorTlsConfig extends TlsConnectionConfig {
  walletLocation?: string;
  walletPassword?: string;
}

@Injectable()
export class TlsOptionsFactory {
  constructor(private readonly config: ConfigService) {}

  axiosConfig(
    url: string,
    tls: TlsConnectionConfig | undefined,
    connectionName: string,
  ): AxiosRequestConfig {
    if (!tls || !this.isEnabled(tls)) {
      return {};
    }
    this.assertTlsUrl(url, connectionName);
    return {
      httpsAgent: new HttpsAgent(this.buildTlsOptions(tls)),
    };
  }

  inboundHttpsOptions(): ServerOptions | undefined {
    const tls = this.fromEnv('HTTP_TLS');
    if (!this.isEnabled(tls)) {
      return undefined;
    }
    const options = this.buildTlsOptions(tls);
    if (!options.cert || !options.key) {
      throw new Error(
        'HTTP_TLS_ENABLED=true requires HTTP_TLS_CERT/HTTP_TLS_CERT_PATH and HTTP_TLS_KEY/HTTP_TLS_KEY_PATH',
      );
    }
    return {
      ...options,
      requestCert: this.toBoolean(tls.requestClientCert),
    };
  }

  kafkaConfig(clientId: string, brokers: string[]): KafkaConfig {
    const tls = this.fromEnv('KAFKA_TLS');
    return {
      clientId,
      brokers,
      ...(this.isEnabled(tls) ? { ssl: this.buildTlsOptions(tls) } : {}),
    };
  }

  redisOptions(): Pick<RedisOptions, 'tls'> {
    const tls = this.fromEnv('REDIS_TLS');
    return this.isEnabled(tls) ? { tls: this.buildTlsOptions(tls) } : {};
  }

  dbConnectorTlsFromEnv(): DbConnectorTlsConfig | undefined {
    const tls = this.fromEnv('DB_CONNECTOR_TLS') as DbConnectorTlsConfig;
    tls.walletLocation =
      this.config.get<string>('DB_CONNECTOR_TLS_WALLET_LOCATION') ??
      process.env['DB_CONNECTOR_TLS_WALLET_LOCATION'];
    tls.walletPassword =
      this.config.get<string>('DB_CONNECTOR_TLS_WALLET_PASSWORD') ??
      process.env['DB_CONNECTOR_TLS_WALLET_PASSWORD'];
    return this.isEnabled(tls) ? tls : undefined;
  }

  dbConnectorSslOptions(
    tls: DbConnectorTlsConfig | undefined,
  ): Record<string, unknown> | undefined {
    if (!tls || !this.isEnabled(tls)) {
      return undefined;
    }
    return this.buildTlsOptions(tls);
  }

  assertTlsUrl(url: string, connectionName: string): void {
    if (!url.toLowerCase().startsWith('https://')) {
      throw new Error(
        `${connectionName} TLS is enabled, but URL does not use https://`,
      );
    }
  }

  isEnabled(tls: TlsConnectionConfig | undefined): boolean {
    return this.toBoolean(tls?.enabled);
  }

  private fromEnv(prefix: string): TlsConnectionConfig {
    return {
      enabled: this.read(`${prefix}_ENABLED`),
      verify: this.read(`${prefix}_VERIFY`),
      rejectUnauthorized: this.read(`${prefix}_REJECT_UNAUTHORIZED`),
      ca: this.read(`${prefix}_CA`),
      caPath: this.read(`${prefix}_CA_PATH`),
      cert: this.read(`${prefix}_CERT`),
      certPath: this.read(`${prefix}_CERT_PATH`),
      key: this.read(`${prefix}_KEY`),
      keyPath: this.read(`${prefix}_KEY_PATH`),
      serverName: this.read(`${prefix}_SERVER_NAME`),
      requestClientCert: this.read(`${prefix}_REQUEST_CLIENT_CERT`),
    };
  }

  private buildTlsOptions(tls: TlsConnectionConfig): Record<string, unknown> {
    const rejectUnauthorized =
      tls.rejectUnauthorized !== undefined
        ? this.toBoolean(tls.rejectUnauthorized)
        : this.toBoolean(tls.verify, true);
    return {
      rejectUnauthorized,
      ...(tls.ca || tls.caPath ? { ca: this.readPem(tls.ca, tls.caPath) } : {}),
      ...(tls.cert || tls.certPath
        ? { cert: this.readPem(tls.cert, tls.certPath) }
        : {}),
      ...(tls.key || tls.keyPath
        ? { key: this.readPem(tls.key, tls.keyPath) }
        : {}),
      ...(tls.serverName ? { servername: tls.serverName } : {}),
    };
  }

  private readPem(value: string | undefined, path: string | undefined): string {
    if (value) {
      return this.normalizePem(value);
    }
    if (!path) {
      throw new Error('TLS PEM value or path is required');
    }
    return readFileSync(path, 'utf8');
  }

  private normalizePem(value: string): string {
    return value.includes('\\n') ? value.replace(/\\n/g, '\n') : value;
  }

  private read(name: string): string | undefined {
    return process.env[name] ?? this.config.get<string>(name);
  }

  private toBoolean(
    value: string | boolean | undefined,
    defaultValue = false,
  ): boolean {
    if (value === undefined) {
      return defaultValue;
    }
    if (typeof value === 'boolean') {
      return value;
    }
    return value === 'true';
  }
}
