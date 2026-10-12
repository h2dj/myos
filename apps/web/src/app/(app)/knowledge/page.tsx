import { formatLocalDay } from '@myos/core';
import { countNotesByType, listNotes, listTags, type NoteType } from '@myos/domain';
import { Lightbulb, BookOpen, FileText, Plus, Search, Star } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { NOTE_TYPE_LABEL } from '@/lib/labels';
import { PageHeader } from '@/components/page-header';
import { TagChip } from '@/components/ui/badges';
import { buttonClass } from '@/components/ui/button';
import { inputClass } from '@/components/ui/field';
import { LinkTabs } from '@/components/ui/tabs';
import { requireSession } from '@/server/auth/session';
import { db } from '@/server/db';

export const metadata: Metadata = { title: '지식 / 아이디어' };

type Tab = 'all' | NoteType | 'favorite' | 'trash';
const TYPE_ICON = { note: FileText, idea: Lightbulb, resource: BookOpen } as const;

export default async function KnowledgePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string; tag?: string }>;
}) {
  const sp = await searchParams;
  const tab: Tab = (['all', 'note', 'idea', 'resource', 'favorite', 'trash'] as const).includes(
    sp.tab as Tab,
  )
    ? (sp.tab as Tab)
    : 'all';
  const { actor, workspace, user } = await requireSession();
  const [notes, counts, tags] = await Promise.all([
    listNotes(db, actor, {
      workspaceId: workspace.id,
      type: tab === 'note' || tab === 'idea' || tab === 'resource' ? tab : undefined,
      favorite: tab === 'favorite' || undefined,
      trash: tab === 'trash' || undefined,
      query: sp.q || undefined,
      tag: sp.tag || undefined,
    }),
    countNotesByType(db, actor, workspace.id),
    listTags(db, actor, workspace.id),
  ]);

  const href = (params: Record<string, string | undefined>) => {
    const merged = { tab: tab === 'all' ? undefined : tab, q: sp.q, tag: sp.tag, ...params };
    const qs = new URLSearchParams(
      Object.entries(merged).filter(([, v]) => v) as [string, string][],
    );
    return `/knowledge${qs.size ? `?${qs}` : ''}`;
  };
  const newType = tab === 'idea' || tab === 'resource' ? tab : 'note';

  return (
    <>
      <PageHeader
        title="지식 / 아이디어"
        description="노트·아이디어·자료를 태그와 프로젝트로 연결합니다."
        actions={
          <Link href={`/knowledge/new?type=${newType}`} className={buttonClass()}>
            <Plus className="size-4" /> 새로 만들기
          </Link>
        }
      />
      <LinkTabs
        active={tab}
        tabs={[
          { key: 'all', label: '전체', href: href({ tab: undefined }), count: counts.all },
          { key: 'note', label: '노트', href: href({ tab: 'note' }), count: counts.note },
          { key: 'idea', label: '아이디어', href: href({ tab: 'idea' }), count: counts.idea },
          {
            key: 'resource',
            label: '자료',
            href: href({ tab: 'resource' }),
            count: counts.resource,
          },
          {
            key: 'favorite',
            label: '즐겨찾기',
            href: href({ tab: 'favorite' }),
            count: counts.favorite,
          },
          { key: 'trash', label: '휴지통', href: href({ tab: 'trash' }) },
        ]}
      />
      <div className="grid gap-6 lg:grid-cols-[14rem_1fr]">
        <aside className="space-y-4">
          <form action="/knowledge" className="relative">
            {tab !== 'all' && <input type="hidden" name="tab" value={tab} />}
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            <input
              name="q"
              defaultValue={sp.q}
              placeholder="검색어를 입력하세요"
              aria-label="노트 검색"
              className={`${inputClass} pl-9`}
            />
          </form>
          {tags.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold text-muted">태그</p>
              <div className="flex flex-wrap gap-1.5">
                {sp.tag && (
                  <Link href={href({ tag: undefined })} className="text-xs text-accent">
                    태그 해제
                  </Link>
                )}
                {tags.map((t) => (
                  <Link
                    key={t.id}
                    href={href({ tag: t.name })}
                    aria-current={sp.tag === t.name ? 'true' : undefined}
                    className={sp.tag === t.name ? 'rounded-md ring-2 ring-accent' : ''}
                  >
                    <TagChip name={t.name} />
                  </Link>
                ))}
              </div>
            </div>
          )}
        </aside>
        <ul className="space-y-3">
          {notes.length === 0 && (
            <li className="rounded-xl border border-dashed border-border bg-surface py-12 text-center text-sm text-muted">
              {sp.q || sp.tag ? '조건에 맞는 항목이 없습니다.' : '아직 기록이 없습니다.'}
            </li>
          )}
          {notes.map((n) => {
            const Icon = TYPE_ICON[n.type];
            return (
              <li key={n.id}>
                <Link
                  href={`/knowledge/${n.id}`}
                  className="flex gap-4 rounded-xl border border-border bg-surface p-4 transition hover:border-accent"
                >
                  <Icon className="mt-0.5 size-6 shrink-0 text-accent" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="truncate font-semibold">
                        {n.isFavorite && (
                          <Star className="mr-1 inline size-3.5 fill-tag-personal text-tag-personal" />
                        )}
                        {n.title}
                      </h2>
                      <span className="shrink-0 text-xs text-muted">
                        {formatLocalDay(n.updatedAt, user.timezone)}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-1 text-sm text-muted">
                      {n.content || NOTE_TYPE_LABEL[n.type]}
                    </p>
                    {n.tags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {n.tags.map((t) => (
                          <TagChip key={t.id} name={t.name} />
                        ))}
                      </div>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}
