const STATUS = {
  running: { label: '실행 중', cls: 'bg-accent-soft text-accent' },
  succeeded: { label: '성공', cls: 'bg-success/10 text-success' },
  failed: { label: '실패', cls: 'bg-danger/10 text-danger' },
  skipped: { label: '건너뜀', cls: 'bg-surface-muted text-muted' },
} as const;

export function RunStatusBadge({ status }: { status: keyof typeof STATUS }) {
  const s = STATUS[status];
  return <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${s.cls}`}>{s.label}</span>;
}
