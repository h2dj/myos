import { describe, expect, it } from 'vitest';
import { devUserId, signDevSession, verifyDevSession } from './dev-session';

describe('dev session', () => {
  it('서명된 토큰만 통과하고 만료되면 거부한다', () => {
    const token = signDevSession('Me@Test.local', 60, 1_000);
    expect(verifyDevSession(token, 1_000)).toBe('me@test.local');
    expect(verifyDevSession(token, 1_000 + 61_000)).toBeNull();
    expect(verifyDevSession(token.replace(/.$/, 'x'), 1_000)).toBeNull();
    expect(verifyDevSession('garbage', 1_000)).toBeNull();
  });

  it('사용자 id는 이메일마다 고정된 UUID 형식', () => {
    expect(devUserId('a@b.c')).toBe(devUserId('A@B.C'));
    expect(devUserId('a@b.c')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});
