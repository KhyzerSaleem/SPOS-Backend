import { BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service';

/**
 * Focused regression coverage for the OTP brute-force fix: verification must
 * track wrong guesses per active challenge (independent of source IP) and
 * lock out after too many attempts, matching the account-level lockout login
 * already has.
 */
describe('AuthService — OTP attempt tracking (consumeOtp)', () => {
  function makeService(otpRecord: any) {
    const otpModel = {
      findOne: jest.fn().mockResolvedValue(otpRecord),
      updateOne: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({}),
    };
    const user = {
      _id: 'user-1',
      email: 'owner@example.com',
      passwordHash: 'old-hash',
      failedLoginAttempts: 3,
      lockUntil: new Date(),
      tokenVersion: 1,
      save: jest.fn().mockResolvedValue(undefined),
    };
    const userModel = { findOne: jest.fn().mockResolvedValue(user) };

    // Every other constructor dependency is unused by resetPassword's success/
    // failure paths — stub them minimally so the constructor is satisfied.
    const stub = {} as any;
    const service = new AuthService(
      userModel as any,
      stub, // tenantModel
      stub, // refreshTokenModel
      stub, // roleModel
      stub, // storeModel
      otpModel as any,
      stub, // inviteModel
      stub, // subscriptionModel
      stub, // jwtService
      { get: jest.fn() } as any, // configService
      stub, // emailService
      stub, // employeePortalSync
      stub, // planLimitsService
      stub, // auditService
    );
    return { service, otpModel, userModel, user };
  }

  it('rejects a wrong code and increments attempts on the active challenge, without revealing which reason', async () => {
    const otpRecord = { _id: 'otp-1', code: '123456', attempts: 0 };
    const { service, otpModel } = makeService(otpRecord);

    await expect(service.resetPassword('owner@example.com', '999999', 'NewPass1')).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.resetPassword('owner@example.com', '999999', 'NewPass1')).rejects.toThrow(
      'Invalid or expired OTP',
    );

    expect(otpModel.updateOne).toHaveBeenCalledWith({ _id: 'otp-1' }, { $inc: { attempts: 1 } });
  });

  it('throws "no OTP" without incrementing anything when no active challenge exists', async () => {
    const { service, otpModel } = makeService(null);

    await expect(
      service.verifyOtpAndLogin({ email: 'owner@example.com', code: '000000' } as any),
    ).rejects.toThrow('Invalid or expired OTP');
    expect(otpModel.updateOne).not.toHaveBeenCalled();
  });

  it('locks out and invalidates the challenge once MAX_OTP_ATTEMPTS is reached, regardless of which IP is guessing', async () => {
    const otpRecord = { _id: 'otp-1', code: '123456', attempts: 5 };
    const { service, otpModel } = makeService(otpRecord);

    await expect(
      service.verifyOtpAndLogin({ email: 'owner@example.com', code: '123456' } as any),
    ).rejects.toThrow('Too many incorrect attempts. Please request a new code.');

    // Even the CORRECT code is rejected once the limit is hit — the challenge
    // itself is dead, not just further guessing.
    expect(otpModel.deleteMany).toHaveBeenCalledWith({ email: 'owner@example.com' });
  });

  it('accepts the correct code under the attempt limit and completes the reset', async () => {
    const otpRecord = { _id: 'otp-1', code: '123456', attempts: 2 };
    const { service, otpModel, user } = makeService(otpRecord);

    const result = await service.resetPassword('owner@example.com', '123456', 'NewPass1');

    expect(result.message).toMatch(/successful/i);
    expect(user.save).toHaveBeenCalled();
    expect(otpModel.deleteMany).toHaveBeenCalledWith({ email: 'owner@example.com' });
    // A successful reset must not have logged a wrong-attempt increment.
    expect(otpModel.updateOne).not.toHaveBeenCalled();
  });

  it('rejects an expired/consumed challenge the same way as a missing one (findOne filters expiresAt/verified)', async () => {
    // The service query itself filters expiresAt > now and verified: false;
    // simulate the "no match" result that produces for an expired code.
    const { service, otpModel } = makeService(null);

    await expect(service.resetPassword('owner@example.com', '123456', 'NewPass1')).rejects.toThrow(
      'Invalid or expired OTP',
    );
    expect(otpModel.deleteMany).not.toHaveBeenCalled();
  });
});
