import { projectPath } from '@myos/core';
import {
  DomainError,
  isUuid,
  listActivities,
  listActivityPlaces,
  listProjectOptions,
  searchWorkspace,
} from '@myos/domain';
import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/page-header';
import { buttonClass } from '@/components/ui/button';
import { inputClass } from '@/components/ui/field';
import { requireSession } from '@/server/auth/session';
import { db } from '@/server/db';

export const metadata: Metadata = { title: '통합 검색' };
const labels = { task: '할 일', project: '프로젝트', activity: '상시 활동', note: '노트' };
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const value = (key: string) => (typeof raw[key] === 'string' ? (raw[key] as string) : '');
  const query = value('q').slice(0, 200);
  const type = ['task', 'project', 'activity', 'note'].includes(value('type'))
    ? (value('type') as keyof typeof labels)
    : 'all';
  const projectId = value('project');
  const activityId = value('activity');
  const activityPlaceId = value('place');
  const includeChildren = value('children') !== 'no';
  const page = Math.min(500, Math.max(1, Number(value('page')) || 1));
  const { actor, workspace } = await requireSession();
  const [projects, activities, places] = await Promise.all([
    listProjectOptions(db, actor, workspace.id),
    listActivities(db, actor, workspace.id),
    listActivityPlaces(db, actor, workspace.id),
  ]);
  let error: string | undefined;
  let result: Awaited<ReturnType<typeof searchWorkspace>> = { results: [], hasMore: false };
  try {
    if ([projectId, activityId, activityPlaceId].some((id) => id && !isUuid(id)))
      throw new Error('필터를 다시 선택하세요.');
    result = await searchWorkspace(db, actor, {
      workspaceId: workspace.id,
      query,
      type,
      projectId: projectId || undefined,
      activityId: activityId || undefined,
      activityPlaceId: activityPlaceId || undefined,
      includeChildren,
      page: Math.floor(page),
    });
  } catch (e) {
    if (e instanceof DomainError)
      error = '필터에 지정한 항목을 찾을 수 없습니다. 필터를 다시 선택하세요.';
    else if (e instanceof Error && e.message === '필터를 다시 선택하세요.') error = e.message;
    else throw e;
  }
  const pageHref = (next: number) => {
    const params = new URLSearchParams({
      q: query,
      type,
      project: projectId,
      activity: activityId,
      place: activityPlaceId,
      children: includeChildren ? 'yes' : 'no',
      page: String(next),
    });
    return `/search?${params}`;
  };
  return (
    <>
      <PageHeader
        title="통합 검색"
        description="현재 공간의 할 일·프로젝트·상시 활동·노트를 검색합니다. 완료한 할 일도 포함합니다."
      />
      <form action="/search" className="mb-6 grid min-w-0 gap-3 sm:grid-cols-2">
        <label className="sm:col-span-2">
          검색어
          <input
            name="q"
            defaultValue={query}
            maxLength={200}
            placeholder="제목 또는 내용 검색"
            className={`${inputClass} mt-1 w-full min-w-0 text-base`}
          />
        </label>
        <label>
          종류
          <select name="type" defaultValue={type} className={`${inputClass} mt-1 w-full`}>
            <option value="all">전체 종류</option>
            {Object.entries(labels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          프로젝트
          <select name="project" defaultValue={projectId} className={`${inputClass} mt-1 w-full`}>
            <option value="">전체 프로젝트</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {projectPath(p, projects)}
              </option>
            ))}
          </select>
        </label>
        <label>
          상시 활동
          <select name="activity" defaultValue={activityId} className={`${inputClass} mt-1 w-full`}>
            <option value="">전체 활동</option>
            {activities.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          활동처
          <select
            name="place"
            defaultValue={activityPlaceId}
            className={`${inputClass} mt-1 w-full`}
          >
            <option value="">전체 활동처</option>
            {places.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          프로젝트 범위
          <select
            name="children"
            defaultValue={includeChildren ? 'yes' : 'no'}
            className={`${inputClass} mt-1 w-full`}
          >
            <option value="yes">하위 프로젝트 포함</option>
            <option value="no">선택한 프로젝트만</option>
          </select>
        </label>
        <div className="flex items-end gap-3">
          <button className={buttonClass()} type="submit">
            검색
          </button>
          <Link href="/search" className="text-sm text-muted">
            초기화
          </Link>
        </div>
      </form>
      <p className="mb-4 text-sm text-muted">
        프로젝트는 연결된 할 일·노트와 프로젝트를, 활동·활동처는 직접 연결된 할 일·활동을
        조회합니다. 여러 필터는 모두 만족해야 합니다.
      </p>
      {error ? (
        <p role="alert">{error}</p>
      ) : result.results.length === 0 ? (
        <p>검색 결과가 없습니다.</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {result.results.map((r) => {
            const href =
              r.type === 'task'
                ? `/tasks/${r.id}`
                : r.type === 'project'
                  ? `/projects/${r.id}`
                  : r.type === 'note'
                    ? `/knowledge/${r.id}`
                    : `/search?type=task&activity=${r.id}`;
            return (
              <li key={`${r.type}:${r.id}`}>
                <Link href={href} className="block min-w-0 px-4 py-3 hover:bg-surface-muted">
                  <span className="text-xs text-muted">{labels[r.type]}</span>
                  <p className="break-words font-medium">{r.title}</p>
                  {r.excerpt && (
                    <p className="line-clamp-2 break-words text-sm text-muted">{r.excerpt}</p>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <nav aria-label="검색 결과 페이지" className="mt-4 flex items-center gap-4">
        {page > 1 && <Link href={pageHref(page - 1)}>이전</Link>}
        <span>{Math.floor(page)}페이지</span>
        {result.hasMore && page < 500 && <Link href={pageHref(page + 1)}>다음</Link>}
        {result.hasMore && page === 500 && (
          <span>검색어나 필터를 좁혀 나머지 결과를 확인하세요.</span>
        )}
      </nav>
    </>
  );
}
