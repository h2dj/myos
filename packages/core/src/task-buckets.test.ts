import { describe, expect, it } from 'vitest';
import { taskBucket, taskDatesForTomorrow } from './task-buckets';

const TZ = 'Asia/Seoul';
// 2026-04-22(수) 10:00 KST
const now = new Date('2026-04-22T01:00:00Z');
const at = (iso: string) => new Date(iso);
const task = (
  scheduledStart: Date | null,
  status: 'todo' | 'done' = 'todo',
  dueAt: Date | null = null,
) => ({
  scheduledStart,
  dueAt,
  status,
});

describe('taskBucket', () => {
  it('날짜가 없으면 언젠가', () => {
    expect(taskBucket(task(null), now, TZ)).toBe('someday');
  });
  it('오늘(KST 기준)', () => {
    expect(taskBucket(task(at('2026-04-21T15:00:00Z')), now, TZ)).toBe('today'); // 4/22 00:00 KST
    expect(taskBucket(task(at('2026-04-22T14:59:00Z')), now, TZ)).toBe('today');
  });
  it('이번 주는 일요일까지', () => {
    expect(taskBucket(task(at('2026-04-26T05:00:00Z')), now, TZ)).toBe('thisWeek');
  });
  it('다음 주', () => {
    expect(taskBucket(task(at('2026-04-27T05:00:00Z')), now, TZ)).toBe('nextWeek');
    expect(taskBucket(task(at('2026-05-04T05:00:00Z')), now, TZ)).toBe('later');
  });
  it('지난 미완료는 overdue, 지난 완료는 overdue 아님', () => {
    expect(taskBucket(task(at('2026-04-20T05:00:00Z')), now, TZ)).toBe('overdue');
    expect(taskBucket(task(at('2026-04-20T05:00:00Z'), 'done'), now, TZ)).toBe('today');
  });
  it('예정일이 없으면 마감일 기준', () => {
    expect(taskBucket(task(null, 'todo', at('2026-04-27T05:00:00Z')), now, TZ)).toBe('nextWeek');
  });
});

describe('taskDatesForTomorrow', () => {
  it('서머타임 경계에서도 다음 현지 날짜와 시각을 유지한다', () => {
    const result = taskDatesForTomorrow(
      {
        scheduledStart: at('2026-03-07T14:00:00Z'), // 뉴욕 09:00
        scheduledEnd: at('2026-03-07T15:00:00Z'),
        dueAt: at('2026-03-08T03:00:00Z'),
      },
      at('2026-03-07T18:00:00Z'),
      'America/New_York',
    );
    expect(result.scheduledStart).toEqual(at('2026-03-08T13:00:00Z'));
    expect(result.scheduledEnd).toEqual(at('2026-03-08T14:00:00Z'));
    expect(result.dueAt).toEqual(at('2026-03-09T02:00:00Z'));
  });
});
