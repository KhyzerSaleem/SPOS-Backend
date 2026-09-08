import { BadRequestException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';

const MAX_SIGNATURE_AGE_SEC = 300;

export function verifyStripeEvent(
  rawBody: Buffer,
  signature: string,
  secret: string,
): Record<string, unknown> {
  if (!signature || !secret) {
    throw new BadRequestException('Missing Stripe signature or webhook secret');
  }

  const parts = signature.split(',').reduce<Record<string, string>>((acc, part) => {
    const [key, value] = part.split('=');
    if (key && value) acc[key.trim()] = value.trim();
    return acc;
  }, {});

  const timestamp = parts.t;
  const sig = parts.v1;
  if (!timestamp || !sig) {
    throw new BadRequestException('Invalid Stripe signature header');
  }

  const ageSec = Math.floor(Date.now() / 1000) - Number(timestamp);
  if (!Number.isFinite(ageSec) || ageSec > MAX_SIGNATURE_AGE_SEC) {
    throw new BadRequestException('Stripe signature timestamp is too old');
  }

  const payload = `${timestamp}.${rawBody.toString('utf8')}`;
  const expected = createHmac('sha256', secret).update(payload).digest('hex');

  const sigBuf = Buffer.from(sig, 'hex');
  const expectedBuf = Buffer.from(expected, 'hex');
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    throw new BadRequestException('Stripe signature verification failed');
  }

  return JSON.parse(rawBody.toString('utf8'));
}
