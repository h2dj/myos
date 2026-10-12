import { TZDate } from '@date-fns/tz';
import { addDays, endOfDay, endOfWeek, startOfDay, startOfWeek } from 'date-fns';

/** 대시보드 기간 프리셋 (기획서 §2.1: 오늘 / 이번 주 / 전체) */
export const PERIOD_PRESETS = ['today', 'week', 'all'] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number];

export interface PeriodRange {
  /** 포함 시작 시각. 전체 기간이면 null */
  start: Date | null;
  /** 포함 종료 시각. 전체 기간이면 null */
  end: Date | null;
}

/**
 * 사용자의 시간대 기준으로 프리셋 기간을 UTC 시각 범위로 계산한다.
 * 주의 시작은 월요일.
 */
export function getPeriodRange(preset: PeriodPreset, now: Date, timeZone: string): PeriodRange {
  const local = new TZDate(now, timeZone);
  switch (preset) {
    case 'today':
      return { start: toDate(startOfDay(local)), end: toDate(endOfDay(local)) };
    case 'week':
      return {
        start: toDate(startOfWeek(local, { weekStartsOn: 1 })),
        end: toDate(endOfWeek(local, { weekStartsOn: 1 })),
      };
    case 'all':
      return { start: null, end: null };
  }
}

/** 시간대 기준 n일 뒤 같은 시각 (마감 임박 계산 등에서 사용) */
export function addLocalDays(date: Date, days: number, timeZone: string): Date {
  return toDate(addDays(new TZDate(date, timeZone), days));
}

function toDate(d: Date): Date {
  return new Date(d.getTime());
}
