import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/**
 * 개발용 세션: "email.만료시각.서명" 형식의 서명 쿠키.
 * 사용자 id는 이메일에서 결정적으로 만든 UUID 형식 값이다.
 */
function secret() {
  return process.env.DEV_AUTH_SECRET ?? 'myos-dev-secret';
}

export function devUserId(email: string): string {
  const h = createHash('sha256').update(email.toLowerCase()).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export function signDevSession(email: string, maxAgeSec: number, now = Date.now()): string {
  const payload = `${Buffer.from(email.toLowerCase()).toString('base64url')}.${now + maxAgeSec * 1000}`;
  return `${payload}.${sign(payload)}`;
}

export function verifyDevSession(token: string | undefined, now = Date.now()): string | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [emailB64, exp, sig] = parts as [string, string, string];
  const expected = sign(`${emailB64}.${exp}`);
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected)))
    return null;
  if (Number(exp) < now) return null;
  return Buffer.from(emailB64, 'base64url').toString();
}

function sign(payload: string) {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}
