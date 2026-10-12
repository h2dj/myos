const TAG_COLORS = [
  'bg-tag-work/10 text-tag-work',
  'bg-tag-health/10 text-tag-health',
  'bg-tag-personal/10 text-tag-personal',
  'bg-tag-creative/10 text-tag-creative',
];

const NAMED: Record<string, number> = { 업무: 0, 건강: 1, 개인: 2, 창작: 3 };

/** 같은 태그는 항상 같은 색 (와이어프레임의 업무/건강/개인/창작 색은 고정) */
export function tagColor(name: string) {
  const fixed = NAMED[name];
  if (fixed !== undefined) return TAG_COLORS[fixed]!;
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TAG_COLORS[h % TAG_COLORS.length]!;
}

export function TagChip({ name }: { name: string }) {
  return (
    <span className={`rounded-md px-1.5 py-0.5 text-xs font-medium ${tagColor(name)}`}>{name}</span>
  );
}

export const PRIORITY_LABEL = { none: '없음', low: '낮음', medium: '보통', high: '높음' } as const;

export function PriorityBadge({ priority }: { priority: keyof typeof PRIORITY_LABEL }) {
  if (priority === 'none' || priority === 'low') return null;
  return (
    <span
      className={`text-xs font-semibold ${priority === 'high' ? 'text-danger' : 'text-tag-personal'}`}
      title={`우선순위 ${PRIORITY_LABEL[priority]}`}
    >
      {priority === 'high' ? '!!' : '!'}
    </span>
  );
}

export function ProgressBar({ value }: { value: number }) {
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted"
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="h-full rounded-full bg-accent" style={{ width: `${value}%` }} />
    </div>
  );
}
