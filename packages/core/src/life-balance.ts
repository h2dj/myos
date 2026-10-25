export const LIFE_FRAMEWORKS = {
  wheel: {
    name: 'Wheel of Life',
    description: '삶의 영역별 만족도와 균형을 살펴봅니다. 월간 회고의 기본으로 추천합니다.',
    source: 'https://positivepsychology.com/wheel-of-life-coaching/',
    areas: [
      { id: 'health', label: '건강', question: '몸과 마음을 돌보며 필요한 휴식을 취했나요?' },
      {
        id: 'relationships',
        label: '가족·관계',
        question: '소중한 사람들과 원하는 연결을 나누었나요?',
      },
      { id: 'work', label: '일·경력', question: '일의 방향과 일하는 방식에 만족하나요?' },
      {
        id: 'finance',
        label: '재정',
        question: '돈을 사용하는 방식과 재정의 안정감에 만족하나요?',
      },
      { id: 'growth', label: '배움·성장', question: '배우고 성장할 기회를 가졌나요?' },
      { id: 'leisure', label: '여가·즐거움', question: '즐거움과 재충전을 위한 시간을 가졌나요?' },
      {
        id: 'environment',
        label: '생활환경',
        question: '살아가는 공간과 일상의 환경에 만족하나요?',
      },
      {
        id: 'meaning',
        label: '의미·기여',
        question: '중요하게 여기는 가치에 따라 살고 기여했나요?',
      },
    ],
  },
  perma: {
    name: 'PERMA 기반 회고',
    description:
      '긍정정서·몰입·관계·의미·성취를 돌아봅니다. 삶의 질을 더 깊이 살펴볼 때 추천합니다.',
    source: 'https://ppc.sas.upenn.edu/learn-more/perma-theory-well-being-and-perma-workshops',
    areas: [
      { id: 'positive', label: '긍정정서', question: '감사, 즐거움, 평온함을 얼마나 경험했나요?' },
      { id: 'engagement', label: '몰입', question: '좋아하는 활동에 깊이 몰입할 수 있었나요?' },
      { id: 'relationships', label: '관계', question: '서로 지지하고 연결되는 관계를 경험했나요?' },
      { id: 'meaning', label: '의미', question: '내가 중요하게 여기는 방향으로 살아갔나요?' },
      { id: 'accomplishment', label: '성취', question: '나에게 의미 있는 진전과 성취가 있었나요?' },
    ],
  },
} as const;
export type LifeFramework = keyof typeof LIFE_FRAMEWORKS;
export interface LifeAreaInput {
  id: string;
  selfScore: number;
  target: number;
  tag: string;
  activityIds: string[];
}
export interface LifeBalanceInput {
  framework: LifeFramework;
  from: string;
  to: string;
  selfWeight: number;
  areas: LifeAreaInput[];
  reflection: string;
  nextAction: string;
}
export interface LifeEvidence {
  id: string;
  title: string;
  completedAt: string;
  activityId: string | null;
  tags: string[];
}
export interface LifeAreaScore {
  id: string;
  label: string;
  selfScore: number;
  completed: number;
  target: number;
  activityScore: number;
  combined: number;
}
export interface LifeBalanceSnapshot {
  version: 1;
  input: LifeBalanceInput;
  timeZone: string;
  areas: LifeAreaScore[];
  selfScore: number;
  activityScore: number;
  combined: number;
  totalCompleted: number;
  unclassified: number;
  conflicts: number;
}
export function lifeAreaFor(task: LifeEvidence, areas: LifeAreaInput[]) {
  const matches = areas.filter(
    (area) =>
      (area.tag && task.tags.includes(area.tag)) ||
      (task.activityId && area.activityIds.includes(task.activityId)),
  );
  return matches.length === 1 ? matches[0]!.id : matches.length > 1 ? 'conflict' : null;
}
export function scoreLifeBalance(
  input: LifeBalanceInput,
  evidence: LifeEvidence[],
  timeZone: string,
): LifeBalanceSnapshot {
  const counts = new Map<string, number>();
  let unclassified = 0,
    conflicts = 0;
  for (const task of evidence) {
    const area = lifeAreaFor(task, input.areas);
    if (area === 'conflict') conflicts++;
    if (!area || area === 'conflict') {
      unclassified++;
      continue;
    }
    counts.set(area, (counts.get(area) ?? 0) + 1);
  }
  const round = (n: number) => Math.round(n * 10) / 10;
  const areas = input.areas.map((area) => {
    const completed = counts.get(area.id) ?? 0;
    const activityScore = round(Math.min(1, completed / area.target) * 10);
    return {
      id: area.id,
      label: LIFE_FRAMEWORKS[input.framework].areas.find((a) => a.id === area.id)!.label,
      selfScore: area.selfScore,
      completed,
      target: area.target,
      activityScore,
      combined: round(
        (area.selfScore * input.selfWeight + activityScore * (100 - input.selfWeight)) / 100,
      ),
    };
  });
  const mean = (field: 'selfScore' | 'activityScore' | 'combined') =>
    round(areas.reduce((sum, area) => sum + area[field], 0) / areas.length);
  return {
    version: 1,
    input,
    timeZone,
    areas,
    selfScore: mean('selfScore'),
    activityScore: mean('activityScore'),
    combined: mean('combined'),
    totalCompleted: evidence.length,
    unclassified,
    conflicts,
  };
}

export function comparableLifeReviews(a: LifeBalanceSnapshot, b: LifeBalanceSnapshot) {
  const config = (s: LifeBalanceSnapshot) =>
    JSON.stringify({
      framework: s.input.framework,
      version: s.version,
      timeZone: s.timeZone,
      days: Date.parse(s.input.to) - Date.parse(s.input.from),
      weight: s.input.selfWeight,
      areas: s.input.areas
        .map((v) => ({
          id: v.id,
          target: v.target,
          tag: v.tag,
          activityIds: [...v.activityIds].sort(),
        }))
        .sort((x, y) => x.id.localeCompare(y.id)),
    });
  return b.input.to < a.input.from && config(a) === config(b);
}
