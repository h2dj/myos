import { describe, expect, it } from 'vitest';
import {
  LIFE_FRAMEWORKS,
  normalizeLifeBalanceSnapshot,
  comparableLifeReviews,
  scoreLifeBalance,
  type LifeBalanceInput,
  type LifeEvidence,
} from './life-balance';

const input = (): LifeBalanceInput => ({
  framework: 'perma',
  from: '2026-10-01',
  to: '2026-10-07',
  selfWeight: 70,
  reflection: '',
  nextAction: '',
  areas: LIFE_FRAMEWORKS.perma.areas.map((a) => ({
    id: a.id,
    selfScore: 8,
    target: 2,
    tag: a.id,
    activityIds: [],
  })),
});
const task = (tags: string[], activityId: string | null = null): LifeEvidence => ({
  id: 'task',
  title: '활동',
  tags,
  activityId,
  completedAt: '2026-10-01T00:00:00Z',
});

describe('삶의 균형 점수', () => {
  it('동일 조건의 이전 비중복 기간만 비교하며 자기평가 값은 달라도 된다', () => {
    const current = scoreLifeBalance(input(), [], 'UTC');
    const previous = structuredClone(current);
    previous.input.from = '2026-09-24';
    previous.input.to = '2026-09-30';
    previous.input.areas[0]!.selfScore = 2;
    expect(comparableLifeReviews(current, previous)).toBe(true);
    previous.input.to = '2026-10-01';
    expect(comparableLifeReviews(current, previous)).toBe(false);
    previous.input.to = '2026-09-30';
    previous.input.areas[0]!.target = 3;
    expect(comparableLifeReviews(current, previous)).toBe(false);
    previous.input.areas[0]!.target = 2;
    previous.timeZone = 'Asia/Seoul';
    expect(comparableLifeReviews(current, previous)).toBe(false);
  });

  it('각 영역의 목표 달성도를 10점으로 제한하고 70:30으로 합산한다', () => {
    const result = scoreLifeBalance(
      input(),
      [task(['positive']), task(['positive']), task(['positive'])],
      'Asia/Seoul',
    );
    expect(result.areas[0]).toMatchObject({
      selfScore: 8,
      completed: 3,
      target: 2,
      activityScore: 10,
      combined: 8.6,
    });
    expect(result.areas[1]).toMatchObject({ activityScore: null, combined: 8 });
    expect(result.combined).toBe(8.1);
    expect(result.activityScore).toBe(10);
  });
  it('기록이 없거나 미분류·충돌뿐이면 비중 0%에서도 자기평가만 반영한다', () => {
    const data = input();
    data.selfWeight = 0;
    for (const evidence of [[], [task(['unknown'])], [task(['positive', 'meaning'])]]) {
      const result = scoreLifeBalance(data, evidence, 'UTC');
      expect(result).toMatchObject({ version: 2, selfScore: 8, combined: 8, activityScore: null });
      expect(
        result.areas.every((a) => a.combined === a.selfScore && a.activityScore === null),
      ).toBe(true);
    }
  });
  it('과거 스냅샷은 저장된 건수로 새 규칙을 적용하되 원본을 수정하지 않는다', () => {
    const legacy = scoreLifeBalance(input(), [task(['positive'])], 'UTC');
    legacy.version = 1;
    legacy.areas[1]!.activityScore = 0;
    legacy.areas[1]!.combined = 5.6;
    const normalized = normalizeLifeBalanceSnapshot(legacy);
    expect(normalized.version).toBe(2);
    expect(normalized.areas[1]).toMatchObject({ activityScore: null, combined: 8 });
    expect(normalized.areas[0]).toMatchObject({ activityScore: 5, combined: 7.1 });
    expect(legacy.areas[1]!.combined).toBe(5.6);
  });
  it('0점과 0/100% 비중도 의미 있게 처리한다', () => {
    const data = input();
    data.selfWeight = 100;
    data.areas[0]!.selfScore = 0;
    expect(scoreLifeBalance(data, [], 'UTC').areas[0]!.combined).toBe(0);
    data.selfWeight = 0;
    expect(scoreLifeBalance(data, [task(['positive'])], 'UTC').areas[0]!.combined).toBe(5);
  });
  it('한 영역에 태그와 활동이 모두 맞아도 한 번만 세며 충돌·미분류를 제외한다', () => {
    const data = input();
    data.areas[0]!.activityIds = ['activity'];
    const result = scoreLifeBalance(
      data,
      [task(['positive'], 'activity'), task(['positive', 'meaning']), task(['unknown'])],
      'UTC',
    );
    expect(result.areas[0]!.completed).toBe(1);
    expect(result).toMatchObject({ totalCompleted: 3, unclassified: 2, conflicts: 1 });
  });
});
