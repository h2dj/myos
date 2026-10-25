import { schema } from '@myos/db';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { requireAccess } from './access';
import type { Actor, Executor } from './context';
import { NotFoundError } from './errors';
const { workspaces } = schema;
export async function personalFinance(db: Executor, actor: Actor, write = false) {
  if (write)
    await db.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${'finance:' + actor.userId}, 0))`,
    );
  const [workspace] = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(
      and(
        eq(workspaces.ownerId, actor.userId),
        eq(workspaces.type, 'personal'),
        isNull(workspaces.deletedAt),
      ),
    );
  if (!workspace) throw new NotFoundError('개인 공간');
  await requireAccess(db, actor, workspace.id, 'manage');
  return workspace.id;
}
