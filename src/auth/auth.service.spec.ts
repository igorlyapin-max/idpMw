import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';

function config(overrides: Record<string, unknown> = {}): ConfigService {
  const values: Record<string, unknown> = {
    ADMIN_AUTH_ENABLED: true,
    ADMIN_AUTH_MODE: 'local',
    ADMIN_AUTH_LOCAL_USERNAME: 'admin',
    ADMIN_AUTH_LOCAL_PASSWORD: 'secret',
    ADMIN_AUTH_SESSION_SECRET: 'test-session-secret',
    ADMIN_AUTH_SESSION_TTL_SECONDS: 28800,
    ADMIN_AUTH_COOKIE_NAME: 'idmmw_admin_session',
    ADMIN_AUTH_COOKIE_SAMESITE: 'Strict',
    NODE_ENV: 'test',
    HTTP_TLS_ENABLED: false,
    ...overrides,
  };
  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}

function response(): Response & { cookieHeader?: string } {
  const res = {
    setHeader: jest.fn((name: string, value: string) => {
      if (name === 'Set-Cookie') {
        res.cookieHeader = value;
      }
    }),
  } as unknown as Response & { cookieHeader?: string };
  return res;
}

function request(headers: Record<string, string> = {}): Request {
  return { headers } as unknown as Request;
}

describe('AuthService', () => {
  it('returns authenticated status when admin auth is disabled', () => {
    const service = new AuthService(config({ ADMIN_AUTH_ENABLED: false }));

    expect(service.sessionStatus(request())).toEqual(
      expect.objectContaining({
        authEnabled: false,
        authenticated: true,
        mode: 'disabled',
      }),
    );
  });

  it('creates a local session and verifies CSRF token', () => {
    const service = new AuthService(config());
    const res = response();

    const login = service.loginLocal('admin', 'secret', res);

    expect(login.authenticated).toBe(true);
    expect(login.csrfToken).toBeTruthy();
    expect(res.cookieHeader).toContain('idmmw_admin_session=');

    const cookie = res.cookieHeader?.split(';')[0] ?? '';
    const req = request({ cookie, 'x-csrf-token': login.csrfToken ?? '' });
    const session = service.authenticateRequest(req);

    expect(session?.sub).toBe('admin');
    expect(service.verifyCsrf(req, session!)).toBe(true);
  });

  it('rejects invalid local credentials', () => {
    const service = new AuthService(config());

    expect(() => service.loginLocal('admin', 'bad', response())).toThrow(
      UnauthorizedException,
    );
  });

  it('creates an SSO session for an allowed group', () => {
    const service = new AuthService(
      config({
        ADMIN_AUTH_MODE: 'sso',
        ADMIN_AUTH_LOCAL_USERNAME: undefined,
        ADMIN_AUTH_LOCAL_PASSWORD: undefined,
        ADMIN_AUTH_ALLOWED_GROUPS: 'idmmw-admins',
      }),
    );
    const res = response();

    const login = service.loginSso(
      request({
        'x-authenticated-user': 'alice',
        'x-authenticated-groups': 'users,idmmw-admins',
      }),
      res,
    );

    expect(login.authenticated).toBe(true);
    expect(login.user).toEqual(
      expect.objectContaining({ name: 'alice', provider: 'sso' }),
    );
  });
});
