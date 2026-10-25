'use client';

import { NOTE_TYPE_LABEL } from '@/lib/labels';
import type { NoteWithTags } from '@myos/domain';
import { CheckSquare, RotateCcw, Star, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import {
  createNoteAction,
  createTaskFromNoteAction,
  deleteNoteAction,
  restoreNoteAction,
  toggleFavoriteAction,
  updateNoteAction,
} from '@/server/actions/notes';
import { Button } from '../ui/button';
import { Field, Input, Select, Textarea } from '../ui/field';
import { FormMessage } from '../ui/form-message';

export function NoteEditor({
  note,
  projects,
  defaultType = 'note',
}: {
  note?: NoteWithTags;
  projects: { id: string; name: string }[];
  defaultType?: keyof typeof NOTE_TYPE_LABEL;
}) {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [pending, startTransition] = useTransition();
  const deleted = Boolean(note?.deletedAt);

  function save(form: FormData) {
    setMessage(undefined);
    startTransition(async () => {
      if (note) {
        const res = await updateNoteAction(note.id, form);
        if (!res.ok) return setError(res.error);
        setError(undefined);
        setMessage('저장했습니다.');
        router.refresh();
      } else {
        const res = await createNoteAction(form);
        if (!res.ok) return setError(res.error);
        router.replace(`/knowledge/${res.data.id}`);
      }
    });
  }

  return (
    <div className="space-y-4">
      <FormMessage error={error} message={message} />
      {!note && (
        <p className="text-xs text-muted">
          저장한 뒤 여러 프로젝트·사업/활동·활동처·할 일에 연결할 수 있습니다.
        </p>
      )}
      {deleted && note && (
        <div className="flex items-center justify-between rounded-lg bg-surface-muted px-4 py-3 text-sm">
          휴지통에 있는 노트입니다.
          <Button
            variant="secondary"
            onClick={() =>
              startTransition(async () => {
                await restoreNoteAction(note.id);
                router.refresh();
              })
            }
          >
            <RotateCcw className="size-4" /> 복구
          </Button>
        </div>
      )}
      <form action={save} className="space-y-4">
        <Input
          name="title"
          required
          aria-label="제목"
          placeholder="제목"
          defaultValue={note?.title}
          autoFocus={!note}
          className="!border-0 !px-0 text-2xl font-bold !ring-0"
          maxLength={300}
        />
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="유형">
            <Select name="type" defaultValue={note?.type ?? defaultType}>
              {Object.entries(NOTE_TYPE_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="프로젝트">
            <Select name="projectId" defaultValue={note?.projectId ?? ''}>
              <option value="">없음</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="태그 (쉼표로 구분)">
            <Input name="tags" defaultValue={note?.tags.map((t) => t.name).join(', ')} />
          </Field>
        </div>
        <Textarea
          name="content"
          aria-label="내용"
          rows={16}
          defaultValue={note?.content}
          placeholder="내용을 입력하세요"
          className="font-mono leading-relaxed"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-2">
            {note && !deleted && (
              <>
                <Button
                  variant="secondary"
                  onClick={() =>
                    startTransition(async () => {
                      await toggleFavoriteAction(note.id, !note.isFavorite);
                      router.refresh();
                    })
                  }
                  aria-pressed={note.isFavorite}
                >
                  <Star
                    className={`size-4 ${note.isFavorite ? 'fill-tag-personal text-tag-personal' : ''}`}
                  />
                  즐겨찾기
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    const title = prompt('만들 할 일 제목', note.title);
                    if (!title) return;
                    startTransition(async () => {
                      const res = await createTaskFromNoteAction(note.id, title);
                      if (!res.ok) setError(res.error);
                      else setMessage('할 일을 만들었습니다. 할 일 화면에서 확인하세요.');
                    });
                  }}
                >
                  <CheckSquare className="size-4" /> 할 일로 만들기
                </Button>
                <Button
                  variant="danger"
                  onClick={() =>
                    startTransition(async () => {
                      await deleteNoteAction(note.id);
                      router.push('/knowledge');
                    })
                  }
                >
                  <Trash2 className="size-4" /> 삭제
                </Button>
              </>
            )}
          </div>
          <div className="flex gap-2">
            <Link href="/knowledge" className="rounded-lg px-3 py-2 text-sm hover:bg-surface-muted">
              목록
            </Link>
            <Button type="submit" disabled={pending || deleted}>
              {pending ? '저장 중…' : '저장'}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
