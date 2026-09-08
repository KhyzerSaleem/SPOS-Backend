import * as crypto from 'crypto';

/**
 * Constant-time comparison of two secret strings.
 *
 * Prevents timing side-channels that a plain `a === b` leaks: string equality
 * short-circuits on the first differing byte, so response latency reveals how
 * many leading characters an attacker guessed correctly. `crypto.timingSafeEqual`
 * always compares the full buffer. Lengths are hashed to equal-size digests so
 * the comparison itself never throws on a length mismatch (which would itself be
 * a timing oracle).
 */
export function secretsMatch(
  provided: string | undefined | null,
  expected: string | undefined | null,
): boolean {
  if (!provided || !expected) return false;

  // Hash both sides to fixed 32-byte buffers so timingSafeEqual never sees a
  // length mismatch (and length differences don't leak via an early throw).
  const a = crypto.createHash('sha256').update(provided).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}
