import { isIP } from 'net';

function normalizeIp(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  if (trimmed.startsWith('::ffff:')) {
    return trimmed.slice('::ffff:'.length);
  }
  return trimmed;
}

function ipv4ToInt(ip: string): number | undefined {
  if (isIP(ip) !== 4) {
    return undefined;
  }
  const parts = ip.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => part < 0 || part > 255)) {
    return undefined;
  }
  return (
    (((parts[0] << 24) >>> 0) +
      ((parts[1] << 16) >>> 0) +
      ((parts[2] << 8) >>> 0) +
      parts[3]) >>>
    0
  );
}

function ipv4MatchesCidr(ip: string, cidr: string): boolean {
  const [base, prefixText] = cidr.split('/');
  const prefix = prefixText === undefined ? 32 : Number(prefixText);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
    return false;
  }
  const ipInt = ipv4ToInt(ip);
  const baseInt = ipv4ToInt(base);
  if (ipInt === undefined || baseInt === undefined) {
    return false;
  }
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}

export function isIpAllowed(
  remoteAddress: string | undefined,
  allowlist: string[],
): boolean {
  const ip = normalizeIp(remoteAddress);
  if (!ip) {
    return false;
  }

  return allowlist.some((entry) => {
    const candidate = normalizeIp(entry);
    if (!candidate) {
      return false;
    }
    if (candidate.includes('/')) {
      return ipv4MatchesCidr(ip, candidate);
    }
    return ip === candidate;
  });
}

export function isPrivateOrLocalAddress(hostname: string): boolean {
  const host = normalizeIp(hostname.toLowerCase());
  if (!host) {
    return false;
  }

  if (host === 'localhost' || host === '::1') {
    return true;
  }

  const ip = ipv4ToInt(host);
  if (ip === undefined) {
    return false;
  }

  return (
    ipv4MatchesCidr(host, '10.0.0.0/8') ||
    ipv4MatchesCidr(host, '172.16.0.0/12') ||
    ipv4MatchesCidr(host, '192.168.0.0/16') ||
    ipv4MatchesCidr(host, '127.0.0.0/8') ||
    ipv4MatchesCidr(host, '169.254.0.0/16') ||
    ipv4MatchesCidr(host, '0.0.0.0/8') ||
    ip === 0xffffffff
  );
}
