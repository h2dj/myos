import { TZDate } from '@date-fns/tz';
import { addWeeks, endOfDay, endOfWeek, startOfDay } from 'date-fns';

/** 할 일 화면의 시점 그룹 (와이어프레임 3: 오늘 / 이번 주 / 다음 주 / 언젠가) */
export const TASK_BUCKETS = [
  'overdue',
  'today',
  'thisWeek',
  'nextWeek',
  'later',
  'someday',
] as const;
export type TaskBucket = (typeof TASK_BUCKETS)[number];

export const TASK_BUCKET_LABELS: Record<TaskBucket, string> = {
  overdue: '지난 할 일',
  today: '오늘',
  thisWeek: '이번 주',
  nextWeek: '다음 주',
  later: '나중에',
  someday: '언젠가',
};

export interface BucketableTask {
  scheduledStart: Date | null;
  dueAt: Date | null;
  status: 'todo' | 'in_progress' | 'done' | 'cancelled';
}

/** 할 일의 기준 날짜: 예정일이 있으면 예정일, 없으면 마감일 */
export function taskAnchorDate(
  task: Pick<BucketableTask, 'scheduledStart' | 'dueAt'>,
): Date | null {
  return task.scheduledStart ?? task.dueAt;
}

export function taskBucket(task: BucketableTask, now: Date, timeZone: string): TaskBucket {
  const anchor = taskAnchorDate(task);
  if (!anchor) return 'someday';

  const local = new TZDate(now, timeZone);
  const todayStart = startOfDay(local).getTime();
  const todayEnd = endOfDay(local).getTime();
  const weekEnd = endOfWeek(local, { weekStartsOn: 1 }).getTime();
  const nextWeekEnd = endOfWeek(addWeeks(local, 1), { weekStartsOn: 1 }).getTime();
  const t = anchor.getTime();

  if (t < todayStart) {
    // 지난 날짜라도 이미 끝낸 일은 '지난 할 일'로 경고하지 않는다. 목록에는 오늘 완료한 일만 남는다
    return task.status === 'done' || task.status === 'cancelled' ? 'today' : 'overdue';
  }
  if (t <= todayEnd) return 'today';
  if (t <= weekEnd) return 'thisWeek';
  if (t <= nextWeekEnd) return 'nextWeek';
  return 'later';
}

export function groupTasksByBucket<T extends BucketableTask>(
  tasks: T[],
  now: Date,
  timeZone: string,
): Record<TaskBucket, T[]> {
  const groups = Object.fromEntries(TASK_BUCKETS.map((b) => [b, [] as T[]])) as Record<
    TaskBucket,
    T[]
  >;
  for (const task of tasks) groups[taskBucket(task, now, timeZone)].push(task);
  return groups;
}
