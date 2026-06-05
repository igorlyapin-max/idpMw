import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError } from 'axios';

export interface PamCredentials {
  tkn?: string;
  user?: string;
  val?: string;
}

@Injectable()
export class IndeedPamAapmClient {
  private readonly logger = new Logger(IndeedPamAapmClient.name);

  constructor(private readonly config: ConfigService) {}

  async getValue(refId: string): Promise<string> {
    const baseUrl = this.required('SECRETS_INDEEDPAMAAPM_BASEURL');
    const endpointPath =
      this.value('SECRETS_INDEEDPAMAAPM_PASSWORDENDPOINTPATH') ??
      '/sc_aapm_ui/rest/aapm/password';
    const [parsedAcctPath, parsedAcctName] = this.parseRefId(refId);
    const acctPath =
      this.value(`SECRETS_REFERENCES_${this.sanitizeKey(refId)}_ACCOUNTPATH`) ??
      parsedAcctPath ??
      this.value('SECRETS_INDEEDPAMAAPM_DEFAULTACCOUNTPATH') ??
      this.throwMissing(
        `SECRETS_REFERENCES_${this.sanitizeKey(refId)}_ACCOUNTPATH`,
      );
    const acctName =
      this.value(`SECRETS_REFERENCES_${this.sanitizeKey(refId)}_ACCOUNTNAME`) ??
      parsedAcctName ??
      this.throwMissing(
        `SECRETS_REFERENCES_${this.sanitizeKey(refId)}_ACCOUNTNAME`,
      );
    const respType =
      this.value(
        `SECRETS_REFERENCES_${this.sanitizeKey(refId)}_RESPONSETYPE`,
      ) ??
      this.value('SECRETS_INDEEDPAMAAPM_RESPONSETYPE') ??
      'json';
    const valueJsonPath =
      this.value(
        `SECRETS_REFERENCES_${this.sanitizeKey(refId)}_VALUEJSONPATH`,
      ) ??
      this.value('SECRETS_INDEEDPAMAAPM_VALUEJSONPATH') ??
      'password';
    const timeoutMs = this.intValue('SECRETS_INDEEDPAMAAPM_TIMEOUTMS', 10000);

    const creds = await this.readCredentials();
    const url = this.buildUrl(baseUrl, endpointPath, {
      token: creds.tkn,
      sapmaccountpath: acctPath,
      sapmaccountname: acctName,
      responsetype: respType,
      passwordexpirationinminute:
        this.value(
          `SECRETS_REFERENCES_${this.sanitizeKey(refId)}_PASSWORDEXPIRATIONINMINUTE`,
        ) ?? this.value('SECRETS_INDEEDPAMAAPM_PASSWORDEXPIRATIONINMINUTE'),
      passwordchangerequired:
        this.boolText(
          `SECRETS_REFERENCES_${this.sanitizeKey(refId)}_PASSWORDCHANGEREQUIRED`,
        ) ?? this.boolText('SECRETS_INDEEDPAMAAPM_PASSWORDCHANGEREQUIRED'),
      comment:
        this.value(`SECRETS_REFERENCES_${this.sanitizeKey(refId)}_COMMENT`) ??
        this.value('SECRETS_INDEEDPAMAAPM_COMMENT') ??
        `idpMw ${refId}`,
      tenantid:
        this.value(`SECRETS_REFERENCES_${this.sanitizeKey(refId)}_TENANTID`) ??
        this.value('SECRETS_INDEEDPAMAAPM_TENANTID'),
      pin:
        this.value(`SECRETS_REFERENCES_${this.sanitizeKey(refId)}_PIN`) ??
        this.value('SECRETS_INDEEDPAMAAPM_PIN'),
    });

    try {
      const response = await axios.get(url, {
        timeout: timeoutMs,
        auth:
          creds.user && creds.val
            ? { username: creds.user, password: creds.val }
            : undefined,
        headers: creds.tkn
          ? { Authorization: `Bearer ${creds.tkn}` }
          : undefined,
      });

      const result = this.extractValue(response.data, respType, valueJsonPath);
      if (!result) {
        throw new Error(`PAM ref '${refId}' returned an empty value.`);
      }
      return result;
    } catch (error: unknown) {
      if (error instanceof AxiosError) {
        this.logger.error(
          `PAM ref '${refId}' request failed: HTTP ${error.response?.status}`,
        );
        throw new Error(
          `PAM ref '${refId}' request failed with HTTP ${error.response?.status}.`,
        );
      }
      throw error;
    }
  }

  private async readCredentials(): Promise<PamCredentials> {
    const tkn = this.value('SECRETS_INDEEDPAMAAPM_APPLICATIONTOKEN');
    if (tkn) return { tkn };

    const tknFile = this.value('SECRETS_INDEEDPAMAAPM_APPLICATIONTOKENFILE');
    if (tknFile) {
      const fs = await import('fs');
      return { tkn: fs.readFileSync(tknFile, 'utf-8').trim() };
    }

    const user = this.value('SECRETS_INDEEDPAMAAPM_APPLICATIONUSERNAME');
    const val = this.value('SECRETS_INDEEDPAMAAPM_APPLICATIONPASSWORD');
    if (user && val) return { user, val };

    throw new Error(
      'PAM credentials are not configured. Set ApplicationToken, ApplicationTokenFile, or ApplicationUsername/ApplicationPassword.',
    );
  }

  private buildUrl(
    baseUrl: string,
    endpointPath: string,
    query: Record<string, string | undefined>,
  ): string {
    const url = new URL(endpointPath, baseUrl);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.append(key, value);
      }
    }
    return url.toString();
  }

  private extractValue(
    body: unknown,
    respType: string,
    jsonPath: string,
  ): string {
    if (
      respType.toLowerCase() !== 'json' ||
      typeof body !== 'object' ||
      body === null
    ) {
      return String(body).trim();
    }

    const obj = body as Record<string, unknown>;
    if (this.tryReadJsonPath(obj, jsonPath)) return obj[jsonPath] as string;

    for (const fallback of ['password', 'value', 'secret', 'Password']) {
      if (this.tryReadJsonPath(obj, fallback)) return obj[fallback] as string;
    }

    return '';
  }

  private tryReadJsonPath(obj: Record<string, unknown>, path: string): boolean {
    const parts = path.split(/[.:]/);
    let current: unknown = obj;
    for (const part of parts) {
      if (
        typeof current !== 'object' ||
        current === null ||
        !(part in current)
      ) {
        return false;
      }
      current = (current as Record<string, unknown>)[part];
    }
    return typeof current === 'string' && current.length > 0;
  }

  private parseRefId(refId: string): [string | undefined, string | undefined] {
    const dot = refId.lastIndexOf('.');
    if (dot > 0 && dot < refId.length - 1) {
      return [refId.slice(0, dot), refId.slice(dot + 1)];
    }
    const slash = refId.lastIndexOf('/');
    if (slash > 0 && slash < refId.length - 1) {
      return [refId.slice(0, slash), refId.slice(slash + 1)];
    }
    return [undefined, undefined];
  }

  private sanitizeKey(key: string): string {
    return key.replace(/[^a-zA-Z0-9_]/g, '_').toUpperCase();
  }

  private required(path: string): string {
    const value = this.value(path);
    if (!value)
      throw new Error(`Required PAM config value is missing: ${path}.`);
    return value;
  }

  private value(path: string): string | undefined {
    const v = this.config.get<string>(path);
    return v?.trim() || undefined;
  }

  private intValue(path: string, defaultValue: number): number {
    const v = this.config.get<string>(path);
    const parsed = parseInt(v ?? '', 10);
    return parsed > 0 ? parsed : defaultValue;
  }

  private boolText(path: string): string | undefined {
    const v = this.config.get<string>(path);
    if (v === undefined) return undefined;
    return String(v.toLowerCase() === 'true');
  }

  private throwMissing(path: string): never {
    throw new Error(`Required PAM config value is missing: ${path}.`);
  }
}
