import { randomUUID } from 'node:crypto';
import { schema } from '@myos/db';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { ensureUserProfile, listWorkspaces, updateProfile } from '../src';
import { db, newUser } from './helpers';

describe('계정 / 공간', () => {
  it('ensureUserProfile은 멱등이며 동시 호출에도 개인 공간이 하나다', async () => {
    const id = randomUUID();
    const input = { id, email: `dup-${id.slice(0, 8)}@test.local` };
    const results = await Promise.all([
      ensureUserProfile(db, input),
      ensureUserProfile(db, input),
      ensureUserProfile(db, input),
    ]);
    expect(new Set(results.map((r) => r.personalWorkspaceId)).size).toBe(1);
    const spaces = await listWorkspaces(db, { userId: id });
    expect(spaces).toHaveLength(1);
    expect(spaces[0]).toMatchObject({ type: 'personal', role: 'owner' });
  });

  it('인증 쪽 이메일이 바뀌면 프로필 이메일도 바뀐다', async () => {
    const id = randomUUID();
    await ensureUserProfile(db, { id, email: `old-${id.slice(0, 8)}@test.local` });
    await ensureUserProfile(db, { id, email: `new-${id.slice(0, 8)}@test.local` });
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, id));
    expect(user!.email).toBe(`new-${id.slice(0, 8)}@test.local`);
  });

  it('프로필 시간대는 유효한 IANA 값만 허용한다', async () => {
    const { actor } = await newUser();
    await expect(updateProfile(db, actor, { name: '지은', timezone: 'Mars/Base' })).rejects.toThrow(
      '시간대',
    );
    const user = await updateProfile(db, actor, { name: '지은', timezone: 'Asia/Tokyo' });
    expect(user.timezone).toBe('Asia/Tokyo');
  });
});
