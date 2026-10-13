import { randomUUID } from 'node:crypto';
import { afterAll } from 'vitest';
import { createDb, schema } from '@myos/db';
import { ensureUserProfile, type Actor } from '../src';

const conn = createDb(process.env.DATABASE_URL ?? 'postgres://myos:myos@localhost:5432/myos');
export const db = conn.db;
afterAll(() => conn.sql.end());

/** 테스트마다 독립된 사용자와 개인 공간을 만든다 (DB 정리 불필요) */
export async function newUser(name = 'tester') {
  const id = randomUUID();
  const { personalWorkspaceId } = await ensureUserProfile(db, {
    id,
    email: `${name}-${id.slice(0, 8)}@test.local`,
    name,
  });
  const actor: Actor = { userId: id };
  return { actor, workspaceId: personalWorkspaceId };
}

export async function addMember(
  workspaceId: string,
  userId: string,
  role: 'owner' | 'editor' | 'viewer',
) {
  await db.insert(schema.workspaceMembers).values({ workspaceId, userId, role });
}

export async function newSharedWorkspace(ownerId: string) {
  const [ws] = await db
    .insert(schema.workspaces)
    .values({ ownerId, name: '공유', type: 'shared' })
    .returning();
  await addMember(ws!.id, ownerId, 'owner');
  return ws!.id;
}
