import { schema } from '@myos/db';
import type { Actor, Executor } from './context';

export async function recordAudit(
  db: Executor,
  actor: Actor,
  entry: {
    workspaceId: string;
    action: string;
    entityType: string;
    entityId: string;
    metadata?: Record<string, unknown>;
  },
) {
  await db.insert(schema.auditLogs).values({ actorId: actor.userId, ...entry });
}
