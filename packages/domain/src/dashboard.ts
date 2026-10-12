import {
  WIDGET_CATALOG,
  WIDGET_SIZES,
  WIDGET_TYPES,
  KPI_METRICS,
  type WidgetType,
} from '@myos/core';
import { schema } from '@myos/db';
import { and, asc, eq, max } from 'drizzle-orm';
import { z } from 'zod';
import { requireAccess } from './access';
import type { Actor, Executor } from './context';
import { NotFoundError, ValidationError } from './errors';
import { isUuid, parse } from './validation';

const { dashboards, dashboardWidgets } = schema;

export type Dashboard = typeof dashboards.$inferSelect;
export type DashboardWidget = typeof dashboardWidgets.$inferSelect;

type NewWidget = Omit<typeof dashboardWidgets.$inferInsert, 'dashboardId' | 'position'>;

/** 와이어프레임 2(메인 대시보드) 기준 기본 구성 */
export const DEFAULT_WIDGETS: NewWidget[] = [
  { type: 'kpi', title: '오늘 할 일', size: 'sm' },
  { type: 'kpi', title: '이번 주 집중 시간', size: 'sm' },
  { type: 'kpi', title: '이번 달 지출', size: 'sm' },
  { type: 'kpi', title: '읽고 있는 문서', size: 'sm' },
  { type: 'tasks', size: 'md' },
  { type: 'schedule', size: 'md' },
  { type: 'inbox', title: '메모 / 빠른 기록', size: 'md' },
  { type: 'projects', size: 'md' },
  { type: 'recent_notes', size: 'md' },
  { type: 'shortcuts', size: 'md' },
  { type: 'automations', size: 'md', hidden: true },
];

/**
 * 사용자의 공간별 대시보드를 가져오고, 없으면 기본 위젯과 함께 만든다(DASH-01, 멱등).
 * 동시 첫 접속에도 UNIQUE(user_id, workspace_id)로 하나만 생긴다.
 */
export async function getOrCreateDashboard(db: Executor, actor: Actor, workspaceId: string) {
  await requireAccess(db, actor, workspaceId, 'read');
  const existing = await findDashboard(db, actor.userId, workspaceId);
  if (existing) return existing;

  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(dashboards)
      .values({ userId: actor.userId, workspaceId })
      .onConflictDoNothing({ target: [dashboards.userId, dashboards.workspaceId] })
      .returning();
    if (!created) return (await findDashboard(tx, actor.userId, workspaceId))!;
    await tx
      .insert(dashboardWidgets)
      .values(DEFAULT_WIDGETS.map((w, i) => ({ ...w, dashboardId: created.id, position: i })));
    return created;
  });
}

export async function listWidgets(db: Executor, actor: Actor, dashboardId: string) {
  await loadOwnDashboard(db, actor, dashboardId);
  return db
    .select()
    .from(dashboardWidgets)
    .where(eq(dashboardWidgets.dashboardId, dashboardId))
    .orderBy(asc(dashboardWidgets.position), asc(dashboardWidgets.createdAt));
}

const areaFilter = z
  .object({
    projectId: z.uuid().optional(),
    tag: z.string().trim().min(1).max(30).optional(),
  })
  .strict();

const dashboardUpdate = z.object({
  period: z.enum(dashboards.period.enumValues).optional(),
  filters: areaFilter.optional(),
  name: z.string().trim().min(1).max(100).optional(),
});

/** 기간 프리셋·영역 필터 저장 (DASH-03) */
export async function updateDashboard(
  db: Executor,
  actor: Actor,
  dashboardId: string,
  input: z.input<typeof dashboardUpdate>,
) {
  const data = parse(dashboardUpdate, input);
  await loadOwnDashboard(db, actor, dashboardId);
  const [d] = await db
    .update(dashboards)
    .set(data)
    .where(eq(dashboards.id, dashboardId))
    .returning();
  return d!;
}

const addInput = z.object({ type: z.enum(WIDGET_TYPES), title: z.string().max(60).optional() });

export async function addWidget(
  db: Executor,
  actor: Actor,
  dashboardId: string,
  input: z.input<typeof addInput>,
) {
  const { type, title } = parse(addInput, input);
  return db.transaction(async (tx) => {
    await loadOwnDashboard(tx, actor, dashboardId);
    const [row] = await tx
      .select({ last: max(dashboardWidgets.position) })
      .from(dashboardWidgets)
      .where(eq(dashboardWidgets.dashboardId, dashboardId));
    const [widget] = await tx
      .insert(dashboardWidgets)
      .values({
        dashboardId,
        type,
        title: title ?? null,
        size: WIDGET_CATALOG[type as WidgetType].defaultSize,
        position: (row?.last ?? -1) + 1,
      })
      .returning();
    return widget!;
  });
}

const widgetUpdate = z.object({
  title: z.string().trim().max(60).nullable().optional(),
  size: z.enum(WIDGET_SIZES).optional(),
  hidden: z.boolean().optional(),
  dataSource: z
    .string()
    .refine((v) => v in KPI_METRICS, '알 수 없는 데이터 소스')
    .nullable()
    .optional(),
  filters: areaFilter.optional(),
  displayConfig: z.record(z.string(), z.unknown()).optional(),
  refreshPolicy: z.enum(dashboardWidgets.refreshPolicy.enumValues).optional(),
});

export async function updateWidget(
  db: Executor,
  actor: Actor,
  widgetId: string,
  input: z.input<typeof widgetUpdate>,
) {
  const data = parse(widgetUpdate, input);
  const widget = await loadOwnWidget(db, actor, widgetId);
  if (data.dataSource !== undefined && widget.type !== 'kpi') {
    throw new ValidationError('데이터 소스는 KPI 위젯에만 지정할 수 있습니다.');
  }
  const [updated] = await db
    .update(dashboardWidgets)
    .set({ ...data, title: data.title === '' ? null : data.title })
    .where(eq(dashboardWidgets.id, widgetId))
    .returning();
  return updated!;
}

export async function removeWidget(db: Executor, actor: Actor, widgetId: string) {
  await loadOwnWidget(db, actor, widgetId);
  await db.delete(dashboardWidgets).where(eq(dashboardWidgets.id, widgetId));
}

/** 위젯 순서 저장. 대시보드의 위젯 id 전체를 새 순서대로 받아야 한다. */
export async function reorderWidgets(
  db: Executor,
  actor: Actor,
  dashboardId: string,
  orderedIds: string[],
) {
  await db.transaction(async (tx) => {
    await loadOwnDashboard(tx, actor, dashboardId);
    const current = await tx
      .select({ id: dashboardWidgets.id })
      .from(dashboardWidgets)
      .where(eq(dashboardWidgets.dashboardId, dashboardId));
    const known = new Set(current.map((w) => w.id));
    if (orderedIds.length !== known.size || !orderedIds.every((id) => known.delete(id))) {
      throw new ValidationError('위젯 목록이 최신이 아닙니다. 새로고침 후 다시 시도하세요.');
    }
    for (const [position, id] of orderedIds.entries()) {
      await tx.update(dashboardWidgets).set({ position }).where(eq(dashboardWidgets.id, id));
    }
  });
}

/** 기본 구성으로 되돌리기 */
export async function resetDashboard(db: Executor, actor: Actor, dashboardId: string) {
  await db.transaction(async (tx) => {
    await loadOwnDashboard(tx, actor, dashboardId);
    await tx.delete(dashboardWidgets).where(eq(dashboardWidgets.dashboardId, dashboardId));
    await tx
      .insert(dashboardWidgets)
      .values(DEFAULT_WIDGETS.map((w, i) => ({ ...w, dashboardId, position: i })));
    await tx
      .update(dashboards)
      .set({ period: 'today', filters: {} })
      .where(eq(dashboards.id, dashboardId));
  });
}

async function findDashboard(db: Executor, userId: string, workspaceId: string) {
  const [d] = await db
    .select()
    .from(dashboards)
    .where(and(eq(dashboards.userId, userId), eq(dashboards.workspaceId, workspaceId)));
  return d;
}

/** 대시보드는 개인 소유: 본인 것만, 그리고 해당 공간에 여전히 접근 가능해야 한다 */
async function loadOwnDashboard(db: Executor, actor: Actor, dashboardId: string) {
  if (!isUuid(dashboardId)) throw new NotFoundError('대시보드');
  const [d] = await db.select().from(dashboards).where(eq(dashboards.id, dashboardId));
  if (!d || d.userId !== actor.userId) throw new NotFoundError('대시보드');
  await requireAccess(db, actor, d.workspaceId, 'read');
  return d;
}

async function loadOwnWidget(db: Executor, actor: Actor, widgetId: string) {
  if (!isUuid(widgetId)) throw new NotFoundError('위젯');
  const [w] = await db.select().from(dashboardWidgets).where(eq(dashboardWidgets.id, widgetId));
  if (!w) throw new NotFoundError('위젯');
  await loadOwnDashboard(db, actor, w.dashboardId);
  return w;
}
