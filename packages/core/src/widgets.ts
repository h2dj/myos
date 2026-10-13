/** 대시보드 위젯 8종 (기획서 §2.1) */
export const WIDGET_TYPES = [
  'tasks',
  'schedule',
  'projects',
  'inbox',
  'automations',
  'kpi',
  'recent_notes',
  'shortcuts',
] as const;
export type WidgetType = (typeof WIDGET_TYPES)[number];

export const WIDGET_SIZES = ['sm', 'md', 'lg', 'full'] as const;
export type WidgetSize = (typeof WIDGET_SIZES)[number];

export const WIDGET_SIZE_LABEL: Record<WidgetSize, string> = {
  sm: '작게',
  md: '보통',
  lg: '크게',
  full: '전체 너비',
};

export interface WidgetDefinition {
  label: string;
  description: string;
  defaultSize: WidgetSize;
}

export const WIDGET_CATALOG: Record<WidgetType, WidgetDefinition> = {
  tasks: { label: '할 일 목록', description: '기간 안의 할 일과 완료 현황', defaultSize: 'md' },
  schedule: { label: '일정', description: '예정일이 잡힌 할 일을 날짜별로', defaultSize: 'md' },
  projects: { label: '프로젝트 현황', description: '진행 중 프로젝트와 진행률', defaultSize: 'md' },
  inbox: { label: '인박스', description: '빠른 기록과 분류 대기 항목', defaultSize: 'md' },
  automations: {
    label: '자동화 상태',
    description: '자동화 규칙과 최근 실행 결과',
    defaultSize: 'md',
  },
  kpi: { label: 'KPI 숫자', description: '지표 하나를 크게 표시', defaultSize: 'sm' },
  recent_notes: { label: '최근 메모', description: '최근 수정한 노트', defaultSize: 'md' },
  shortcuts: { label: '바로가기', description: '자주 가는 화면 링크', defaultSize: 'md' },
};

/**
 * KPI 위젯이 고를 수 있는 지표. 데이터 소스가 없는(null) KPI는 "데이터 소스 미설정"으로 표시한다
 * (확정 사항 #4: 카드 뷰만 먼저, 데이터는 사후 설정).
 */
export const KPI_METRICS = {
  'tasks.progress': '할 일 완료 (완료/전체)',
  'tasks.open': '남은 할 일 수',
  'projects.active': '진행 중 프로젝트 수',
  'inbox.pending': '분류 대기 인박스',
  'notes.created': '기간 내 작성한 노트 수',
} as const;
export type KpiMetric = keyof typeof KPI_METRICS;

export function isKpiMetric(value: unknown): value is KpiMetric {
  return typeof value === 'string' && value in KPI_METRICS;
}

/** 위젯 순서 이동: index의 항목을 한 칸 앞(-1)/뒤(+1)로 옮긴 새 배열 */
export function moveItem<T>(items: readonly T[], index: number, delta: -1 | 1): T[] {
  const target = index + delta;
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) return [...items];
  const next = [...items];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}
