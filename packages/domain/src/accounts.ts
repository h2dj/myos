import { schema } from '@myos/db';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import type { Actor, Executor } from './context';
import { NotFoundError } from './errors';
import { parse } from './validation';

const { users, workspaces, workspaceMembers } = schema;

const profileInput = z.object({
  id: z.uuid(),
  email: z.email(),
  name: z.string().trim().min(1).max(100).optional(),
});

/**
 * 인증된 사용자의 프로필과 개인 공간을 보장한다(로그인 직후 호출, 멱등).
 * 개인 공간은 workspaces_personal_owner_uq로 동시 호출에도 하나만 생긴다.
 */
export async function ensureUserProfile(
  db: Executor,
  input: z.input<typeof profileInput>,
): Promise<{ userId: string; personalWorkspaceId: string }> {
  const { id, email, name } = parse(profileInput, input);

  await db
    .insert(users)
    .values({ id, email, name: name ?? email.split('@')[0]! })
    .onConflictDoUpdate({ target: users.id, set: { email } });

  await db
    .insert(workspaces)
    .values({ ownerId: id, name: '개인 공간', type: 'personal' })
    .onConflictDoNothing({
      target: workspaces.ownerId,
      where: eq(workspaces.type, 'personal'),
    });

  const [personal] = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(and(eq(workspaces.ownerId, id), eq(workspaces.type, 'personal')));
  if (!personal) throw new Error('개인 공간 생성 실패');

  await db
    .insert(workspaceMembers)
    .values({ workspaceId: personal.id, userId: id, role: 'owner' })
    .onConflictDoNothing();

  return { userId: id, personalWorkspaceId: personal.id };
}

export async function getProfile(db: Executor, actor: Actor) {
  const [user] = await db.select().from(users).where(eq(users.id, actor.userId));
  if (!user) throw new NotFoundError('사용자');
  return user;
}

const profileUpdate = z.object({
  name: z.string().trim().min(1).max(100),
  timezone: z.string().refine(isValidTimeZone, '알 수 없는 시간대'),
});

export async function updateProfile(
  db: Executor,
  actor: Actor,
  input: z.input<typeof profileUpdate>,
) {
  const data = parse(profileUpdate, input);
  const [user] = await db.update(users).set(data).where(eq(users.id, actor.userId)).returning();
  if (!user) throw new NotFoundError('사용자');
  return user;
}

/** 사용자가 속한 공간 목록. 개인 공간이 먼저 온다. */
export async function listWorkspaces(db: Executor, actor: Actor) {
  return db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      type: workspaces.type,
      role: workspaceMembers.role,
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(and(eq(workspaceMembers.userId, actor.userId), isNull(workspaces.deletedAt)))
    .orderBy(asc(workspaces.type), asc(workspaces.createdAt));
}

function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
