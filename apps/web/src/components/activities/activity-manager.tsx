'use client';
import Link from 'next/link';
import type { Activity, ActivityPlace } from '@myos/domain';
import { useState, useTransition } from 'react';
import {
  saveActivityAction,
  saveActivityPlaceAction,
  deleteActivityAction,
  deleteActivityPlaceAction,
} from '@/server/actions/activities';
import { Button } from '../ui/button';
import { Dialog } from '../ui/dialog';
import { Field, Input, Select, Textarea } from '../ui/field';
import { FormMessage } from '../ui/form-message';

type Editing = { kind: 'activity'; row?: Activity } | { kind: 'place'; row?: ActivityPlace };
export function ActivityManager({
  activities,
  places,
}: {
  activities: Activity[];
  places: ActivityPlace[];
}) {
  const [editing, setEditing] = useState<Editing | null>(null);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  function remove(kind: Editing['kind'], id: string) {
    if (!confirm('삭제할까요? 연결된 할 일은 남고 해당 연결만 해제됩니다.')) return;
    startTransition(async () => {
      setError(undefined);
      const res =
        kind === 'activity' ? await deleteActivityAction(id) : await deleteActivityPlaceAction(id);
      if (!res.ok) setError(res.error);
    });
  }
  return (
    <div className="space-y-8">
      <FormMessage error={error} />
      <section aria-label="상시 사업·활동">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="font-semibold">상시 사업·활동</h2>
          <Button
            onClick={() => {
              setError(undefined);
              setEditing({ kind: 'activity' });
            }}
          >
            사업·활동 추가
          </Button>
        </div>
        <p className="mb-3 text-sm text-muted">
          마감 없이 이어지는 사업과 활동입니다. 할 일에 프로젝트와 함께 연결할 수 있습니다.
        </p>
        {activities.length === 0 && (
          <p className="text-sm text-muted">등록된 사업·활동이 없습니다.</p>
        )}
        <ul className="divide-y divide-border rounded-xl border border-border">
          {activities.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-2 p-3">
              <div className="min-w-0 flex-1">
                <Link
                  className="font-medium text-accent"
                  href={`/search?type=task&activity=${a.id}`}
                >
                  {a.name}
                </Link>
                <p className="text-xs text-muted">
                  {places.find((p) => p.id === a.placeId)?.name ?? '활동처 미지정'}
                </p>
                {a.description && <p className="text-sm text-muted">{a.description}</p>}
              </div>
              <Link
                href={`/activities/${a.id}`}
                aria-label={`${a.name} 관련 항목`}
                className="rounded-lg px-3 py-2 text-sm text-accent"
              >
                관련 항목
              </Link>
              <Button
                variant="secondary"
                aria-label={`${a.name} 편집`}
                disabled={pending}
                onClick={() => {
                  setError(undefined);
                  setEditing({ kind: 'activity', row: a });
                }}
              >
                편집
              </Button>
              <Button
                variant="danger"
                aria-label={`${a.name} 삭제`}
                disabled={pending}
                onClick={() => remove('activity', a.id)}
              >
                삭제
              </Button>
            </li>
          ))}
        </ul>
      </section>
      <section aria-label="활동처">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="font-semibold">활동처</h2>
          <Button
            onClick={() => {
              setError(undefined);
              setEditing({ kind: 'place' });
            }}
          >
            활동처 추가
          </Button>
        </div>
        <p className="mb-3 text-sm text-muted">단체·회사·장소를 별도 목록으로 관리합니다.</p>
        {places.length === 0 && <p className="text-sm text-muted">등록된 활동처가 없습니다.</p>}
        <ul className="divide-y divide-border rounded-xl border border-border">
          {places.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-2 p-3">
              <div className="min-w-0 flex-1">
                <Link className="font-medium text-accent" href={`/search?place=${p.id}`}>
                  {p.name}
                </Link>
                {p.description && <p className="text-sm text-muted">{p.description}</p>}
              </div>
              <Link
                href={`/activities/places/${p.id}`}
                aria-label={`${p.name} 관련 항목`}
                className="rounded-lg px-3 py-2 text-sm text-accent"
              >
                관련 항목
              </Link>
              <Button
                variant="secondary"
                aria-label={`${p.name} 편집`}
                disabled={pending}
                onClick={() => {
                  setError(undefined);
                  setEditing({ kind: 'place', row: p });
                }}
              >
                편집
              </Button>
              <Button
                variant="danger"
                aria-label={`${p.name} 삭제`}
                disabled={pending}
                onClick={() => remove('place', p.id)}
              >
                삭제
              </Button>
            </li>
          ))}
        </ul>
      </section>
      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.kind === 'place' ? '활동처 등록·편집' : '사업·활동 등록·편집'}
      >
        {editing && (
          <form
            key={`${editing.kind}-${editing.row?.id ?? 'new'}`}
            className="space-y-4"
            action={(form) =>
              startTransition(async () => {
                setError(undefined);
                const res =
                  editing.kind === 'place'
                    ? await saveActivityPlaceAction(editing.row?.id ?? null, form)
                    : await saveActivityAction(editing.row?.id ?? null, form);
                if (!res.ok) setError(res.error);
                else setEditing(null);
              })
            }
          >
            <FormMessage error={error} />
            <Field label="이름">
              <Input
                name="name"
                defaultValue={editing.row?.name}
                required
                maxLength={200}
                autoFocus
              />
            </Field>
            {editing.kind === 'activity' && (
              <Field label="기본 활동처">
                <Select name="placeId" defaultValue={editing.row?.placeId ?? ''}>
                  <option value="">없음</option>
                  {places.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <Field label="설명">
              <Textarea
                name="description"
                defaultValue={editing.row?.description ?? ''}
                maxLength={10000}
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setEditing(null)}>
                취소
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? '저장 중…' : '저장'}
              </Button>
            </div>
          </form>
        )}
      </Dialog>
    </div>
  );
}
