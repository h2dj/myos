import Link from 'next/link';

export function LinkTabs({
  tabs,
  active,
}: {
  tabs: { key: string; label: string; href: string; count?: number; disabled?: boolean }[];
  active: string;
}) {
  return (
    <div className="mb-5 flex gap-1 overflow-x-auto border-b border-border" role="tablist">
      {tabs.map((t) =>
        t.disabled ? (
          <span
            key={t.key}
            className="cursor-not-allowed px-3 py-2 text-sm whitespace-nowrap text-muted/60"
            title="준비 중"
          >
            {t.label}
          </span>
        ) : (
          <Link
            key={t.key}
            href={t.href}
            role="tab"
            aria-selected={active === t.key}
            className={`-mb-px border-b-2 px-3 py-2 text-sm whitespace-nowrap ${
              active === t.key
                ? 'border-foreground font-semibold'
                : 'border-transparent text-muted hover:text-foreground'
            }`}
          >
            {t.label}
            {t.count !== undefined && <span className="ml-1 text-xs text-muted">{t.count}</span>}
          </Link>
        ),
      )}
    </div>
  );
}
