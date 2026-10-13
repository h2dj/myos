import { schema } from '@myos/db';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import {
  createRecurringTask,
  generateDueOccurrences,
  generateSeriesOccurrences,
  getTask,
  stopSeries,
} from '../src';
import { db, newUser } from './helpers';

const TZ = 'Asia/Seoul';
const occurrences = (seriesId: string) =>
  db
    .select({ date: schema.tasks.occurrenceDate })
    .from(schema.tasks)
    .where(eq(schema.tasks.seriesId, seriesId))
    .orderBy(schema.tasks.occurrenceDate)
    .then((rows) => rows.map((r) => r.date));

describe('반복 할 일 (TASK-02, 인수 테스트 #3)', () => {
  it('만들 때 오늘 회차가 생기고, 같은 날 여러 번 생성해도 중복되지 않는다', async () => {
    const { actor, workspaceId } = await newUser();
    const { series, created } = await createRecurringTask(
      db,
      actor,
      {
        workspaceId,
        title: '운동 30분',
        rule: { freq: 'daily' },
        timezone: TZ,
        startDate: '2026-04-20',
        tags: ['건강'],
      },
      '2026-04-22',
    );
    expect(created).toHaveLength(3); // 20, 21, 22일
    const task = await getTask(db, actor, created[2]!);
    expect(task).toMatchObject({
      title: '운동 30분',
      occurrenceDate: '2026-04-22',
      seriesId: series.id,
    });
    expect(task.tags.map((t) => t.name)).toEqual(['건강']);

    // 같은 날 다시, 그리고 동시에 여러 번
    await Promise.all([
      generateSeriesOccurrences(db, series.id, '2026-04-22'),
      generateSeriesOccurrences(db, series.id, '2026-04-22'),
      generateDueOccurrences(db, workspaceId, '2026-04-22'),
    ]);
    expect(await occurrences(series.id)).toEqual(['2026-04-20', '2026-04-21', '2026-04-22']);

    // 다음 날
    await Promise.all([
      generateDueOccurrences(db, workspaceId, '2026-04-23'),
      generateDueOccurrences(db, workspaceId, '2026-04-23'),
    ]);
    expect(await occurrences(series.id)).toHaveLength(4);
  });

  it('회차 날짜가 이미 있으면(직접 되돌린 시리즈 커서 등) 건너뛴다', async () => {
    const { actor, workspaceId } = await newUser();
    const { series } = await createRecurringTask(
      db,
      actor,
      {
        workspaceId,
        title: '주간 정리',
        rule: { freq: 'weekly', byWeekday: [1] },
        timezone: TZ,
        startDate: '2026-04-20',
      },
      '2026-04-20',
    );
    // 커서를 과거로 되돌려도 이미 있는 회차는 다시 만들지 않는다
    await db
      .update(schema.taskSeries)
      .set({ nextOccurrence: '2026-04-20' })
      .where(eq(schema.taskSeries.id, series.id));
    expect(await generateSeriesOccurrences(db, series.id, '2026-04-27')).toHaveLength(1);
    expect(await occurrences(series.id)).toEqual(['2026-04-20', '2026-04-27']);
  });

  it('밀린 회차는 최근 7일분만 만든다', async () => {
    const { actor, workspaceId } = await newUser();
    const { series } = await createRecurringTask(
      db,
      actor,
      {
        workspaceId,
        title: '물 마시기',
        rule: { freq: 'daily' },
        timezone: TZ,
        startDate: '2026-04-01',
      },
      '2026-04-01',
    );
    await generateSeriesOccurrences(db, series.id, '2026-04-30');
    const dates = await occurrences(series.id);
    expect(dates[0]).toBe('2026-04-01');
    expect(dates.slice(1)).toEqual([
      '2026-04-24',
      '2026-04-25',
      '2026-04-26',
      '2026-04-27',
      '2026-04-28',
      '2026-04-29',
      '2026-04-30',
    ]);
  });

  it('반복 중지 후에는 생성하지 않는다', async () => {
    const { actor, workspaceId } = await newUser();
    const { series } = await createRecurringTask(
      db,
      actor,
      { workspaceId, title: 'x', rule: { freq: 'daily' }, timezone: TZ, startDate: '2026-04-22' },
      '2026-04-22',
    );
    await stopSeries(db, actor, series.id);
    expect(await generateDueOccurrences(db, workspaceId, '2026-04-25')).toEqual({
      series: 0,
      created: 0,
    });
  });
});
