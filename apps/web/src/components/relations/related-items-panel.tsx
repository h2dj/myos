'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { RELATION_LABELS, RELATION_TARGETS, type RelationKind, type RelationRef } from '@myos/core';
import type { getRelatedItems, searchRelationTargets } from '@myos/domain';
import {
  addRelatedItemAction,
  getRelatedItemsAction,
  removeRelatedItemAction,
  searchRelationTargetsAction,
} from '@/server/actions/relations';
import { Button } from '../ui/button';
import { Field, Input, Select } from '../ui/field';
import { FormMessage } from '../ui/form-message';

type Context = Awaited<ReturnType<typeof getRelatedItems>>;
type Options = Awaited<ReturnType<typeof searchRelationTargets>>;
export function RelatedItemsPanel({ source }: { source: RelationRef }) {
  const { type, id } = source;
  const [context, setContext] = useState<Context>();
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const [targetType, setTargetType] = useState<RelationKind>(RELATION_TARGETS[type][0]!);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [options, setOptions] = useState<Options>();
  const [selected, setSelected] = useState('');
  const generation = useRef(0);
  const load = async () => {
    const version = ++generation.current;
    const res = await getRelatedItemsAction({ type, id });
    if (version !== generation.current) return;
    if (!res.ok) {
      setContext(undefined);
      setError(res.error);
      return;
    }
    setContext(res.data);
    setError(undefined);
  };
  useEffect(() => {
    let cancelled = false;
    const version = ++generation.current;
    getRelatedItemsAction({ type, id }).then((res) => {
      if (cancelled || generation.current !== version) return;
      if (!res.ok) {
        setContext(undefined);
        setError(res.error);
        return;
      }
      setContext(res.data);
      setError(undefined);
    });
    return () => {
      cancelled = true;
    };
  }, [type, id]);
  useEffect(() => {
    let cancelled = false;
    searchRelationTargetsAction({ type, id }, { type: targetType, query: search, page }).then(
      (res) => {
        if (cancelled) return;
        if (!res.ok) {
          setOptions(undefined);
          setError(res.error);
          return;
        }
        setOptions(res.data);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [type, id, targetType, search, page, revision]);
  return (
    <section
      aria-label="관련 항목"
      className="space-y-3 rounded-xl border border-border bg-surface p-4"
    >
      <h2 className="font-semibold">관련 항목</h2>
      <p className="text-xs text-muted">
        같은 공간의 항목을 연결합니다. 사업·활동의 관련 활동·프로젝트와 지식·아이디어의 연결을
        양쪽에서 확인할 수 있습니다.
      </p>
      <FormMessage error={error} />
      {!context && !error && <p className="text-sm text-muted">연결을 불러오는 중…</p>}
      {context && (
        <>
          {context.links.length === 0 && (
            <p className="text-sm text-muted">연결된 항목이 없습니다.</p>
          )}
          <ul className="divide-y divide-border">
            {context.links.map((link) => (
              <li
                key={`${link.item.type}:${link.item.id}`}
                className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
              >
                <div className="min-w-0">
                  <Link href={link.item.href} className="break-words text-accent">
                    {link.item.title}
                  </Link>
                  <p className="text-xs text-muted">
                    {RELATION_LABELS[link.item.type]}
                    {link.kind === 'primary'
                      ? ' · 기본 프로젝트 연결 (노트에서 변경)'
                      : link.kind === 'derived_from'
                        ? ' · 파생 연결'
                        : ''}
                  </p>
                </div>
                {link.removable && (
                  <Button
                    variant="ghost"
                    disabled={pending}
                    aria-label={`${link.item.title} 연결 해제`}
                    onClick={() =>
                      startTransition(async () => {
                        const res = await removeRelatedItemAction({ type, id }, link.id);
                        if (!res.ok) return setError(res.error);
                        await load();
                      })
                    }
                  >
                    연결 해제
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {context.canWrite ? (
            <div className="space-y-3 border-t border-border pt-3">
              <form
                className="flex flex-wrap items-end gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  setPage(1);
                  setSearch(query);
                  setRevision((value) => value + 1);
                  setOptions(undefined);
                  setSelected('');
                }}
              >
                <Field label="연결 유형">
                  <Select
                    value={targetType}
                    onChange={(e) => {
                      setTargetType(e.target.value as RelationKind);
                      setRevision((value) => value + 1);
                      setOptions(undefined);
                      setPage(1);
                      setSelected('');
                    }}
                  >
                    {RELATION_TARGETS[type].map((kind) => (
                      <option key={kind} value={kind}>
                        {RELATION_LABELS[kind]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <div className="min-w-0 flex-1">
                  <Field label="연결 항목 검색">
                    <Input
                      value={query}
                      maxLength={200}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="이름이나 제목"
                    />
                  </Field>
                </div>
                <Button type="submit" variant="secondary">
                  찾기
                </Button>
              </form>
              <Field label="연결할 항목">
                <Select value={selected} onChange={(e) => setSelected(e.target.value)}>
                  <option value="">항목 선택</option>
                  {options?.results
                    .filter(
                      (item) =>
                        !context.links.some(
                          (link) => link.item.type === item.type && link.item.id === item.id,
                        ),
                    )
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.title}
                      </option>
                    ))}
                </Select>
              </Field>
              {options && options.results.length === 0 && (
                <p className="text-xs text-muted">
                  검색 결과가 없습니다. 항목을 먼저 만들거나 검색어를 바꿔 보세요.
                </p>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  disabled={pending || !selected}
                  onClick={() =>
                    startTransition(async () => {
                      const res = await addRelatedItemAction(
                        { type, id },
                        { type: targetType, id: selected },
                      );
                      if (!res.ok) return setError(res.error);
                      setSelected('');
                      await load();
                    })
                  }
                >
                  연결 추가
                </Button>
                {page > 1 && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setPage(page - 1);
                      setSelected('');
                    }}
                  >
                    이전 검색 결과
                  </Button>
                )}
                {options?.hasMore && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setPage(page + 1);
                      setSelected('');
                    }}
                  >
                    다음 검색 결과
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted">조회 권한으로 연결을 읽을 수 있습니다.</p>
          )}
        </>
      )}
    </section>
  );
}
