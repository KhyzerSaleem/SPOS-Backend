import * as crypto from 'crypto';
import { BadRequestException } from '@nestjs/common';
import { verifyStripeEvent } from './stripe-webhook.util';

describe('verifyStripeEvent', () => {
  const secret = 'whsec_test_secret_key_for_unit_tests';

  function sign(body: string, timestamp: number) {
    const payload = `${timestamp}.${body}`;
    const v1 = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    return `t=${timestamp},v1=${v1}`;
  }

  it('verifies a valid signature', () => {
    const body = JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed' });
    const ts = Math.floor(Date.now() / 1000);
    const event = verifyStripeEvent(Buffer.from(body), sign(body, ts), secret);
    expect(event.type).toBe('checkout.session.completed');
  });

  it('rejects stale timestamps', () => {
    const body = JSON.stringify({ id: 'evt_2' });
    const ts = Math.floor(Date.now() / 1000) - 600;
    expect(() => verifyStripeEvent(Buffer.from(body), sign(body, ts), secret)).toThrow(
      BadRequestException,
    );
  });

  it('rejects invalid signatures', () => {
    const body = JSON.stringify({ id: 'evt_3' });
    const ts = Math.floor(Date.now() / 1000);
    expect(() => verifyStripeEvent(Buffer.from(body), `t=${ts},v1=deadbeef`, secret)).toThrow(
      BadRequestException,
    );
  });
});
