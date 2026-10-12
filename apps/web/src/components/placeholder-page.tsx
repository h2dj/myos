import { Construction } from 'lucide-react';
import { findNavItem, phaseLabel } from '@/lib/navigation';
import { PageHeader } from './page-header';

/** 아직 구현되지 않은 화면의 자리표시자. 메뉴 정의(navigation.ts)에서 제목과 단계를 가져온다. */
export function PlaceholderPage({ href }: { href: string }) {
  const item = findNavItem(href);
  return (
    <>
      <PageHeader title={item.label} description={item.description} />
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-surface px-6 py-20 text-center">
        <Construction className="size-8 text-muted" aria-hidden />
        <p className="font-medium">{phaseLabel(item.phase)}</p>
        <p className="text-sm text-muted">
          개발계획(docs/development-plan.md)의 일정에 따라 채워집니다.
        </p>
      </div>
    </>
  );
}
