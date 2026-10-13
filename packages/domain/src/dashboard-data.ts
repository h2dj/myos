import { addLocalDays, getPeriodRange, isKpiMetric, type KpiMetric } from '@myos/core';
import { utcToLocalDate } from '@myos/core';
import type { AreaFilter } from '@myos/db/schema';
import { automationSummary } from './automations';
import type { Actor, Executor } from './context';
import type { Dashboard, DashboardWidget } from './dashboard';
import { listInbox, type InboxItem } from './inbox';
import { listNotes, type NoteWithTags } from './notes';
import { listProjects, type ProjectWithProgress } from './projects';
import { listTasks, type TaskWithTags } from './tasks';

export interface Shortcut {
  label: string;
  href: string;
}

export const DEFAULT_SHORTCUTS: Shortcut[] = [
  { label: '할 일', href: '/tasks' },
  { label: '새 노트', href: '/knowledge/new' },
  { label: '인박스', href: '/inbox' },
  { label: '프로젝트', href: '/projects' },
];

export type WidgetData =
  | { type: 'tasks'; items: TaskWithTags[]; done: number; total: number }
  | { type: 'schedule'; days: { date: string; items: TaskWithTags[] }[] }
  | { type: 'projects'; items: ProjectWithProgress[] }
  | { type: 'inbox'; pending: number; items: InboxItem[] }
  | {
      type: 'automations';
      items: {
        id: string;
        name: string;
        nextRunAt: Date | null;
        lastStatus: string | null;
        lastRunAt: Date | null;
      }[];
    }
  | { type: 'kpi'; metric: KpiMetric | null; value: string | null; hint: string | null }
  | { type: 'recent_notes'; items: NoteWithTags[] }
  | { type: 'shortcuts'; links: Shortcut[] };

const PERIOD_HINT = { today: '오늘', week: '이번 주', all: '전체' } as const;

/**
 * 대시보드에 보이는 위젯들의 데이터를 한 번에 계산한다.
 * 같은 조건의 조회는 한 번만 실행해 위젯끼리 공유한다(대시보드 p95 2초 목표).
 */
export async function loadDashboardData(
  db: Executor,
  actor: Actor,
  input: {
    dashboard: Dashboard;
    widgets: DashboardWidget[];
    now: Date;
    timeZone: string;
  },
): Promise<Record<string, WidgetData>> {
  const { dashboard, now, timeZone } = input;
  const workspaceId = dashboard.workspaceId;
  const range = getPeriodRange(dashboard.period, now, timeZone);
  const todayStart = getPeriodRange('today', now, timeZone).start!;

  const memo = new Map<string, Promise<unknown>>();
  const once = <T>(key: string, fn: () => Promise<T>): Promise<T> => {
    if (!memo.has(key)) memo.set(key, fn());
    return memo.get(key) as Promise<T>;
  };

  const periodTasks = (area: AreaFilter) =>
    once(`tasks:${JSON.stringify(area)}`, () =>
      listTasks(db, actor, {
        workspaceId,
        projectId: area.projectId,
        tag: area.tag,
        from: range.start ?? undefined,
        to: range.end ?? undefined,
        status: range.start ? undefined : ['todo', 'in_progress', 'done'],
        completedSince: range.start ?? todayStart,
        limit: 500,
      }),
    );
  const activeProjects = () =>
    once('projects', () =>
      listProjects(db, actor, { workspaceId, status: ['planned', 'active', 'on_hold'] }),
    );
  const pendingInbox = () => once('inbox', () => listInbox(db, actor, { workspaceId }));
  const notes = (area: AreaFilter) =>
    once(`notes:${JSON.stringify(area)}`, () =>
      listNotes(db, actor, { workspaceId, projectId: area.projectId, tag: area.tag, limit: 50 }),
    );

  const result: Record<string, WidgetData> = {};
  await Promise.all(
    input.widgets
      .filter((w) => !w.hidden)
      .map(async (w) => {
        const area: AreaFilter = { ...dashboard.filters, ...w.filters };
        const limit = numberConfig(w.displayConfig.limit, 8);
        switch (w.type) {
          case 'tasks': {
            const all = (await periodTasks(area)).filter((t) => t.status !== 'cancelled');
            result[w.id] = {
              type: 'tasks',
              items: all.slice(0, limit),
              done: all.filter((t) => t.status === 'done').length,
              total: all.length,
            };
            break;
          }
          case 'schedule': {
            // 오늘 프리셋에서도 일정은 오늘부터 7일을 보여준다
            const from = range.start ?? todayStart;
            const to =
              dashboard.period === 'week'
                ? range.end!
                : addLocalDays(todayStart, dashboard.period === 'today' ? 7 : 14, timeZone);
            const items = await once(`schedule:${JSON.stringify(area)}`, () =>
              listTasks(db, actor, {
                workspaceId,
                projectId: area.projectId,
                tag: area.tag,
                from,
                to,
                status: ['todo', 'in_progress', 'done'],
                limit: 200,
              }),
            );
            const byDay = new Map<string, TaskWithTags[]>();
            for (const t of items) {
              if (!t.scheduledStart) continue;
              const day = utcToLocalDate(t.scheduledStart, timeZone);
              byDay.set(day, [...(byDay.get(day) ?? []), t]);
            }
            result[w.id] = {
              type: 'schedule',
              days: [...byDay.entries()]
                .sort(([a], [b]) => a.localeCompare(b))
                .slice(0, limit)
                .map(([date, items]) => ({ date, items })),
            };
            break;
          }
          case 'projects': {
            const all = await activeProjects();
            result[w.id] = {
              type: 'projects',
              items: (area.projectId ? all.filter((p) => p.id === area.projectId) : all).slice(
                0,
                limit,
              ),
            };
            break;
          }
          case 'inbox': {
            const items = await pendingInbox();
            result[w.id] = { type: 'inbox', pending: items.length, items: items.slice(0, 3) };
            break;
          }
          case 'automations':
            result[w.id] = {
              type: 'automations',
              items: await once('automations', () => automationSummary(db, actor, workspaceId)),
            };
            break;
          case 'recent_notes':
            result[w.id] = { type: 'recent_notes', items: (await notes(area)).slice(0, limit) };
            break;
          case 'shortcuts':
            result[w.id] = { type: 'shortcuts', links: shortcutsConfig(w.displayConfig.links) };
            break;
          case 'kpi': {
            const metric = isKpiMetric(w.dataSource) ? w.dataSource : null;
            const hint = PERIOD_HINT[dashboard.period];
            let value: string | null = null;
            if (metric === 'tasks.progress' || metric === 'tasks.open') {
              const all = (await periodTasks(area)).filter((t) => t.status !== 'cancelled');
              const done = all.filter((t) => t.status === 'done').length;
              value =
                metric === 'tasks.progress' ? `${done} / ${all.length}` : String(all.length - done);
            } else if (metric === 'projects.active') {
              value = String((await activeProjects()).length);
            } else if (metric === 'inbox.pending') {
              value = String((await pendingInbox()).length);
            } else if (metric === 'notes.created') {
              const list = await notes(area);
              value = String(list.filter((n) => !range.start || n.createdAt >= range.start).length);
            }
            result[w.id] = { type: 'kpi', metric, value, hint: metric ? hint : null };
            break;
          }
        }
      }),
  );
  return result;
}

function numberConfig(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 50
    ? value
    : fallback;
}

/** 바로가기는 앱 내부 경로만 허용한다 */
function shortcutsConfig(value: unknown): Shortcut[] {
  if (!Array.isArray(value)) return DEFAULT_SHORTCUTS;
  const links = value.filter(
    (l): l is Shortcut =>
      typeof l?.label === 'string' &&
      typeof l?.href === 'string' &&
      l.href.startsWith('/') &&
      !l.href.startsWith('//'),
  );
  return links.length ? links.slice(0, 12) : DEFAULT_SHORTCUTS;
}
