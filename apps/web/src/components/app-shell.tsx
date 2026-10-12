'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { useState } from 'react';
import { MAIN_NAV, UTILITY_NAV, isActive, type NavItem } from '@/lib/navigation';
import { Logo } from './logo';

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // 메뉴를 연 경로를 기억해, 다른 경로로 이동하면 모바일 메뉴가 자동으로 닫히게 한다
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const open = openedAt === pathname;

  return (
    <div className="min-h-dvh md:flex">
      {/* 모바일 상단 바 */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-surface px-4 md:hidden">
        <Link href="/dashboard" aria-label="대시보드로 이동">
          <Logo />
        </Link>
        <button
          type="button"
          onClick={() => setOpenedAt(open ? null : pathname)}
          aria-label={open ? '메뉴 닫기' : '메뉴 열기'}
          aria-expanded={open}
          aria-controls="app-sidebar"
          className="rounded-md p-2 hover:bg-surface-muted"
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </header>

      <aside
        id="app-sidebar"
        className={`${open ? 'block' : 'hidden'} fixed inset-x-0 top-14 bottom-0 z-20 overflow-y-auto border-r border-border bg-surface md:sticky md:top-0 md:flex md:h-dvh md:w-60 md:shrink-0 md:flex-col`}
      >
        <div className="hidden h-16 items-center px-5 md:flex">
          <Link href="/dashboard" aria-label="대시보드로 이동">
            <Logo />
          </Link>
        </div>
        <nav aria-label="주 메뉴" className="flex flex-1 flex-col justify-between gap-6 p-3">
          <NavList items={MAIN_NAV} pathname={pathname} />
          <NavList items={UTILITY_NAV} pathname={pathname} />
        </nav>
      </aside>

      <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
    </div>
  );
}

function NavList({ items, pathname }: { items: NavItem[]; pathname: string }) {
  return (
    <ul className="space-y-0.5">
      {items.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <li key={href}>
            <Link
              href={href}
              aria-current={active ? 'page' : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                active
                  ? 'bg-accent-soft font-semibold text-foreground'
                  : 'text-muted hover:bg-surface-muted hover:text-foreground'
              }`}
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
