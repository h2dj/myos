import { schema } from '@myos/db';
import { and, eq, isNull, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { requireAccess } from './access';
import { assertActivityInWorkspace, assertActivityPlaceInWorkspace } from './activities';
import type { Actor, Executor } from './context';
import { NotFoundError } from './errors';
import { parse } from './validation';

const inputSchema = z.object({
  workspaceId: z.uuid(),
  query: z.string().trim().max(200).default(''),
  type: z.enum(['all', 'task', 'project', 'activity', 'note']).default('all'),
  projectId: z.uuid().optional(),
  includeChildren: z.boolean().default(true),
  activityId: z.uuid().optional(),
  activityPlaceId: z.uuid().optional(),
  page: z.number().int().min(1).max(500).default(1),
});
export type SearchResult = {
  id: string;
  type: 'task' | 'project' | 'activity' | 'note';
  title: string;
  excerpt: string | null;
};

/** Active workspace only. Filters run before pagination, including completed tasks. */
export async function searchWorkspace(
  db: Executor,
  actor: Actor,
  input: z.input<typeof inputSchema>,
): Promise<{ results: SearchResult[]; hasMore: boolean }> {
  const q = parse(inputSchema, input);
  await requireAccess(db, actor, q.workspaceId, 'read');
  let projectIds: string[] | undefined;
  if (q.projectId) {
    const rows = await db
      .select({ id: schema.projects.id, parentId: schema.projects.parentId })
      .from(schema.projects)
      .where(
        and(eq(schema.projects.workspaceId, q.workspaceId), isNull(schema.projects.deletedAt)),
      );
    if (!rows.some((p) => p.id === q.projectId)) throw new NotFoundError('프로젝트');
    const selected = new Set([q.projectId]);
    if (q.includeChildren) {
      const children = new Map<string, string[]>();
      for (const p of rows) {
        if (p.parentId) {
          const siblings = children.get(p.parentId) ?? [];
          siblings.push(p.id);
          children.set(p.parentId, siblings);
        }
      }
      const pending = [q.projectId];
      while (pending.length) {
        for (const id of children.get(pending.pop()!) ?? []) {
          if (!selected.has(id)) {
            selected.add(id);
            pending.push(id);
          }
        }
      }
    }
    projectIds = [...selected];
  }
  if (q.activityId) await assertActivityInWorkspace(db, q.activityId, q.workspaceId);
  if (q.activityPlaceId) await assertActivityPlaceInWorkspace(db, q.activityPlaceId, q.workspaceId);
  const pattern = `%${q.query.replace(/[\\%_]/g, '\\$&')}%`;
  const ids = projectIds
    ? sql.join(
        projectIds.map((id) => sql`${id}::uuid`),
        sql`, `,
      )
    : undefined;
  const parts: SQL[] = [];
  const { tasks: t, projects: p, activities: a, notes: n } = schema;
  const match = (title: SQL, body: SQL) =>
    sql`(${title} ilike ${pattern} or ${body} ilike ${pattern})`;
  if (q.type === 'all' || q.type === 'task') {
    parts.push(sql`select ${t.id} as id, 'task'::text as type, ${t.title} as title,
      left(${t.description}, 160) as excerpt, ${t.updatedAt} as updated_at
      from ${t} where ${t.workspaceId} = ${q.workspaceId} and ${t.deletedAt} is null
      and ${match(sql`${t.title}`, sql`${t.description}`)}
      ${ids ? sql`and ${t.projectId} in (${ids})` : sql``}
      ${q.activityId ? sql`and ${t.activityId} = ${q.activityId}` : sql``}
      ${q.activityPlaceId ? sql`and ${t.activityPlaceId} = ${q.activityPlaceId}` : sql``}`);
  }
  if (!q.activityId && !q.activityPlaceId) {
    if (q.type === 'all' || q.type === 'project')
      parts.push(sql`select ${p.id}, 'project'::text, ${p.name}, left(${p.description}, 160), ${p.updatedAt}
      from ${p} where ${p.workspaceId} = ${q.workspaceId} and ${p.deletedAt} is null
      and ${match(sql`${p.name}`, sql`${p.description}`)} ${ids ? sql`and ${p.id} in (${ids})` : sql``}`);
    if (q.type === 'all' || q.type === 'note')
      parts.push(sql`select ${n.id}, 'note'::text, ${n.title}, left(${n.content}, 160), ${n.updatedAt}
      from ${n} where ${n.workspaceId} = ${q.workspaceId} and ${n.deletedAt} is null
      and ${match(sql`${n.title}`, sql`${n.content}`)} ${ids ? sql`and ${n.projectId} in (${ids})` : sql``}`);
  }
  if (!q.projectId && (q.type === 'all' || q.type === 'activity')) {
    parts.push(sql`select ${a.id}, 'activity'::text, ${a.name}, left(${a.description}, 160), ${a.updatedAt}
      from ${a} where ${a.workspaceId} = ${q.workspaceId} and ${a.deletedAt} is null
      and ${match(sql`${a.name}`, sql`${a.description}`)}
      ${q.activityId ? sql`and ${a.id} = ${q.activityId}` : sql``}
      ${q.activityPlaceId ? sql`and ${a.placeId} = ${q.activityPlaceId}` : sql``}`);
  }
  if (!parts.length) return { results: [], hasMore: false };
  const rows =
    await db.execute<SearchResult>(sql`select id, type, title, excerpt from (${sql.join(parts, sql` union all `)}) as results
    order by updated_at desc, type, id limit 21 offset ${(q.page - 1) * 20}`);
  return { results: [...rows].slice(0, 20), hasMore: rows.length > 20 };
}
