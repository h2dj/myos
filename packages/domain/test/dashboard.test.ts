import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WIDGETS,
  addWidget,
  createProject,
  createTask,
  getOrCreateDashboard,
  listWidgets,
  loadDashboardData,
  removeWidget,
  reorderWidgets,
  resetDashboard,
  setTaskStatus,
  updateDashboard,
  updateWidget,
  type DashboardWidget,
} from '../src';
import { db, newUser } from './helpers';

const TZ = 'Asia/Seoul';

describe('대시보드 구성 (DASH-01, DASH-02)', () => {
  it('첫 접속 시 기본 위젯과 함께 하나만 만들어진다', async () => {
    const { actor, workspaceId } = await newUser();
    const results = await Promise.all([
      getOrCreateDashboard(db, actor, workspaceId),
      getOrCreateDashboard(db, actor, workspaceId),
    ]);
    expect(results[0].id).toBe(results[1].id);
    const widgets = await listWidgets(db, actor, results[0].id);
    expect(widgets).toHaveLength(DEFAULT_WIDGETS.length);
    expect(widgets.map((w) => w.position)).toEqual(DEFAULT_WIDGETS.map((_, i) => i));
  });

  it('추가·숨김·크기·순서·삭제가 저장되어 다시 불러와도 유지된다 (인수 테스트 #1)', async () => {
    const { actor, workspaceId } = await newUser();
    const dash = await getOrCreateDashboard(db, actor, workspaceId);
    const added = await addWidget(db, actor, dash.id, { type: 'recent_notes', title: '독서 메모' });
    let widgets = await listWidgets(db, actor, dash.id);
    expect(widgets.at(-1)!.id).toBe(added.id);

    await updateWidget(db, actor, widgets[0]!.id, { hidden: true });
    await updateWidget(db, actor, added.id, { size: 'full' });
    await removeWidget(db, actor, widgets[1]!.id);
    widgets = await listWidgets(db, actor, dash.id);
    const reversed = widgets.map((w) => w.id).reverse();
    await reorderWidgets(db, actor, dash.id, reversed);
    await updateDashboard(db, actor, dash.id, { period: 'week' });

    // "재접속": 같은 사용자로 처음부터 다시 조회
    const again = await getOrCreateDashboard(db, actor, workspaceId);
    expect(again.period).toBe('week');
    const reloaded = await listWidgets(db, actor, again.id);
    expect(reloaded.map((w) => w.id)).toEqual(reversed);
    expect(reloaded.find((w) => w.id === added.id)).toMatchObject({
      size: 'full',
      title: '독서 메모',
    });
    expect(reloaded.filter((w) => w.hidden)).toHaveLength(2); // 기본 숨김(자동화) + 방금 숨긴 것
    expect(reloaded).toHaveLength(DEFAULT_WIDGETS.length);
  });

  it('순서 저장은 전체 위젯 id가 맞아야 한다', async () => {
    const { actor, workspaceId } = await newUser();
    const dash = await getOrCreateDashboard(db, actor, workspaceId);
    const ids = (await listWidgets(db, actor, dash.id)).map((w) => w.id);
    await expect(reorderWidgets(db, actor, dash.id, ids.slice(1))).rejects.toThrow(
      '최신이 아닙니다',
    );
    await expect(reorderWidgets(db, actor, dash.id, [...ids.slice(1), ids[1]!])).rejects.toThrow(
      '최신이 아닙니다',
    );
  });

  it('다른 사용자의 대시보드·위젯은 건드릴 수 없다', async () => {
    const me = await newUser('me');
    const other = await newUser('other');
    const dash = await getOrCreateDashboard(db, me.actor, me.workspaceId);
    const [w] = await listWidgets(db, me.actor, dash.id);
    await expect(listWidgets(db, other.actor, dash.id)).rejects.toThrow('찾을 수 없습니다');
    await expect(updateWidget(db, other.actor, w!.id, { hidden: true })).rejects.toThrow();
    await expect(removeWidget(db, other.actor, w!.id)).rejects.toThrow();
    await expect(updateDashboard(db, other.actor, dash.id, { period: 'all' })).rejects.toThrow();
    await expect(getOrCreateDashboard(db, other.actor, me.workspaceId)).rejects.toThrow();
  });

  it('데이터 소스는 KPI 위젯에만, 정해진 지표만', async () => {
    const { actor, workspaceId } = await newUser();
    const dash = await getOrCreateDashboard(db, actor, workspaceId);
    const widgets = await listWidgets(db, actor, dash.id);
    const kpi = widgets.find((w) => w.type === 'kpi')!;
    const tasks = widgets.find((w) => w.type === 'tasks')!;
    await expect(
      updateWidget(db, actor, kpi.id, { dataSource: 'finance.spend' }),
    ).rejects.toThrow();
    await expect(updateWidget(db, actor, tasks.id, { dataSource: 'tasks.open' })).rejects.toThrow(
      'KPI',
    );
    await updateWidget(db, actor, kpi.id, { dataSource: 'tasks.progress' });
    await updateWidget(db, actor, kpi.id, { dataSource: null });
  });

  it('기본 구성으로 되돌리기', async () => {
    const { actor, workspaceId } = await newUser();
    const dash = await getOrCreateDashboard(db, actor, workspaceId);
    await addWidget(db, actor, dash.id, { type: 'shortcuts' });
    await updateDashboard(db, actor, dash.id, { period: 'all' });
    await resetDashboard(db, actor, dash.id);
    expect(await listWidgets(db, actor, dash.id)).toHaveLength(DEFAULT_WIDGETS.length);
    expect((await getOrCreateDashboard(db, actor, workspaceId)).period).toBe('today');
  });
});

describe('위젯 데이터 (DASH-03, 인수 테스트 #2)', () => {
  async function setup() {
    const user = await newUser();
    const dash = await getOrCreateDashboard(db, user.actor, user.workspaceId);
    const widgets = await listWidgets(db, user.actor, dash.id);
    const kpi = widgets.find((w) => w.type === 'kpi')!;
    await updateWidget(db, user.actor, kpi.id, { dataSource: 'tasks.progress' });
    return { ...user, dash };
  }
  const load = async (s: Awaited<ReturnType<typeof setup>>, now: Date) => {
    const dashboard = await getOrCreateDashboard(db, s.actor, s.workspaceId);
    const widgets = await listWidgets(db, s.actor, dashboard.id);
    const data = await loadDashboardData(db, s.actor, { dashboard, widgets, now, timeZone: TZ });
    const of = <T extends DashboardWidget['type']>(type: T) =>
      widgets.filter((w) => w.type === type && !w.hidden).map((w) => data[w.id]!);
    return { data, widgets, of };
  };

  it('할 일 상태를 바꾸면 할 일 위젯과 KPI 수치가 갱신된다', async () => {
    const s = await setup();
    const now = new Date();
    const a = await createTask(db, s.actor, {
      workspaceId: s.workspaceId,
      title: 'A',
      scheduledStart: now,
    });
    await createTask(db, s.actor, { workspaceId: s.workspaceId, title: 'B', scheduledStart: now });
    await createTask(db, s.actor, { workspaceId: s.workspaceId, title: '날짜 없음' });

    let { of } = await load(s, now);
    expect(of('tasks')[0]).toMatchObject({ done: 0, total: 2 });
    expect(of('kpi')[0]).toMatchObject({ metric: 'tasks.progress', value: '0 / 2', hint: '오늘' });
    expect(of('kpi')[1]).toMatchObject({ metric: null, value: null }); // 미설정 카드

    await setTaskStatus(db, s.actor, a.id, 'done');
    ({ of } = await load(s, now));
    expect(of('tasks')[0]).toMatchObject({ done: 1, total: 2 });
    expect(of('kpi')[0]).toMatchObject({ value: '1 / 2' });
  });

  it('기간 프리셋과 영역(프로젝트·태그) 필터', async () => {
    const s = await setup();
    const now = new Date('2026-04-22T01:00:00Z'); // 수요일 10:00 KST
    const project = await createProject(db, s.actor, { workspaceId: s.workspaceId, name: '업무' });
    const mk = (title: string, iso: string | null, extra = {}) =>
      createTask(db, s.actor, {
        workspaceId: s.workspaceId,
        title,
        scheduledStart: iso ? new Date(iso) : null,
        ...extra,
      });
    await mk('오늘', '2026-04-22T03:00:00Z', { projectId: project.id });
    await mk('금요일', '2026-04-24T03:00:00Z', { tags: ['건강'] });
    await mk('다음주', '2026-04-28T03:00:00Z');
    await mk('언젠가', null);

    const titles = async () => {
      const data = (await load(s, now)).of('tasks')[0];
      return data?.type === 'tasks' ? data.items.map((t) => t.title) : [];
    };

    expect(await titles()).toEqual(['오늘']);
    await updateDashboard(db, s.actor, s.dash.id, { period: 'week' });
    expect(await titles()).toEqual(['오늘', '금요일']);
    await updateDashboard(db, s.actor, s.dash.id, { period: 'all' });
    expect(await titles()).toEqual(['오늘', '금요일', '다음주', '언젠가']);

    await updateDashboard(db, s.actor, s.dash.id, { filters: { projectId: project.id } });
    expect(await titles()).toEqual(['오늘']);
    await updateDashboard(db, s.actor, s.dash.id, { filters: { tag: '건강' } });
    expect(await titles()).toEqual(['금요일']);

    // 일정 위젯: 이번 주 프리셋은 예정일 있는 할 일을 날짜별로
    await updateDashboard(db, s.actor, s.dash.id, { period: 'week', filters: {} });
    const schedule = (await load(s, now)).of('schedule')[0];
    expect(schedule).toMatchObject({
      type: 'schedule',
      days: [{ date: '2026-04-22' }, { date: '2026-04-24' }],
    });
  });
});
