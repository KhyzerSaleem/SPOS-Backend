import { BadRequestException, Logger } from '@nestjs/common';
import * as dns from 'dns/promises';
import { isIP } from 'net';

const logger = new Logger('SsrfGuard');

/**
 * Blocks outbound requests to private, loopback, link-local, and other
 * non-public IP ranges — the standard SSRF target set, most notably
 * 169.254.169.254 (AWS/GCP/Azure instance metadata: the most common real-world
 * path from SSRF to full cloud-account takeover via stolen IAM credentials).
 */
function isPrivateOrReservedIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) {
    const parts = ip.split('.').map(Number);
    const [a, b] = parts;
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 127) return true; // loopback
    if (a === 169 && b === 254) return true; // link-local incl. cloud metadata
    if (a === 0) return true; // "this network"
    if (a >= 224) return true; // multicast/reserved
    return false;
  }
  if (version === 6) {
    const lower = ip.toLowerCase();
    if (lower === '::1') return true; // loopback
    if (lower.startsWith('fe80:') || lower.startsWith('fe80::')) return true; // link-local
    if (/^f[cd][0-9a-f]{2}:/.test(lower)) return true; // fc00::/7 unique local
    if (lower.startsWith('::ffff:')) {
      // IPv4-mapped IPv6 — recurse on the embedded v4 address.
      const v4 = lower.split(':').pop() || '';
      return isIP(v4) === 4 ? isPrivateOrReservedIp(v4) : true;
    }
    return false;
  }
  return true; // couldn't parse as an IP at all — treat as unsafe
}

/**
 * Validates a tenant-supplied URL is safe to make an outbound HTTP request to
 * (webhook delivery, any future "call this URL" integration). Throws
 * BadRequestException if not.
 *
 * Resolves DNS itself rather than trusting the parsed hostname, and must be
 * called again immediately before every actual network request — not just
 * once at input time — because a hostname's DNS record can change between
 * when a user registers a URL and when it's dispatched (DNS rebinding): an
 * attacker can point a domain at a public IP to pass validation, then
 * re-point it at an internal address before the request fires.
 */
export async function assertPublicHttpUrl(rawUrl: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new BadRequestException('Invalid URL');
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new BadRequestException('URL must use http or https');
  }

  // URL.hostname wraps a literal IPv6 address in brackets (e.g. "[::1]"),
  // which net.isIP() does not recognize — strip them before checking.
  const hostname = parsed.hostname.replace(/^\[|\]$/g, '');
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    throw new BadRequestException('URL may not target a local/internal address');
  }

  // A literal IP in the URL — check it directly, no DNS lookup needed.
  if (isIP(hostname)) {
    if (isPrivateOrReservedIp(hostname)) {
      throw new BadRequestException('URL may not target a private or reserved IP address');
    }
    return;
  }

  let addresses: string[];
  try {
    const records = await dns.lookup(hostname, { all: true, verbatim: true });
    addresses = records.map((r) => r.address);
  } catch (err) {
    logger.warn(`DNS lookup failed for webhook host "${hostname}": ${(err as Error).message}`);
    throw new BadRequestException('Could not resolve URL host');
  }

  if (addresses.length === 0) {
    throw new BadRequestException('Could not resolve URL host');
  }
  if (addresses.some((addr) => isPrivateOrReservedIp(addr))) {
    throw new BadRequestException('URL may not target a private or reserved IP address');
  }
}
