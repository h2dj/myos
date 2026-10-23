'use client';

import { NOTION_FIELDS, notionFieldsFor, type NotionField, type NotionKind } from '@myos/core';
import type {
  NotionImportSummary,
  NotionMapping,
  NotionPreview,
  NotionRequest,
} from '@myos/domain';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import {
  inspectNotionAction,
  previewNotionAction,
  importNotionAction,
} from '@/server/actions/notion';
import { Button } from '../ui/button';
import { Field, Input, Select } from '../ui/field';
import { FormMessage } from '../ui/form-message';

const kinds: Record<NotionKind, string> = {
  task: '할 일',
  project: '프로젝트',
  activity: '상시 사업·활동',
  place: '활동처',
};
const dispositions = {
  new: '신규',
  duplicate: '중복 건너뛰기',
  changed: '변경됨 · 덮어쓰기 안 함',
  error: '오류',
};
const aliases: Record<NotionField, string[]> = {
  sourceId: ['$notion.id', 'id', '페이지 ID', 'Notion ID', 'URL', '페이지 URL'],
  title: ['이름', '제목', 'Name', 'title', 'name'],
  description: ['메모', '설명', 'description'],
  status: ['상태', 'status'],
  completed: ['완료', 'completed'],
  completedAt: ['완료일', 'completedAt'],
  scheduledStart: ['예정일', '예정 시작일', 'scheduledStart'],
  scheduledEnd: ['예정일.end', '예정 종료일', 'scheduledEnd'],
  dueAt: ['마감일', 'dueAt'],
  priority: ['우선순위', 'priority'],
  tags: ['태그', 'tags'],
  parent: ['상위 프로젝트', 'parent'],
  project: ['프로젝트', 'project'],
  activity: ['상시 활동', 'activity'],
  place: ['활동처', 'place'],
  createdAt: ['$notion.created_time', 'createdAt'],
  sourceUpdatedAt: ['$notion.last_edited_time', 'sourceUpdatedAt'],
};
function guess(columns: string[], kind: NotionKind): NotionMapping {
  const used = new Set<string>();
  return {
    kind,
    columns: Object.fromEntries(
      notionFieldsFor(kind).map((field) => {
        const key = field as NotionField;
        const column =
          aliases[key]
            .map((alias) =>
              columns.find((c) => c.toLowerCase() === alias.toLowerCase() && !used.has(c)),
            )
            .find(Boolean) ?? '';
        if (column) used.add(column);
        return [key, column];
      }),
    ),
  };
}
export function NotionImporter({ timeZone }: { timeZone: string }) {
  const [text, setText] = useState('');
  const [format, setFormat] = useState<'csv' | 'json'>('csv');
  const [filename, setFilename] = useState('');
  const [columns, setColumns] = useState<string[]>([]);
  const [mapping, setMapping] = useState<NotionMapping>({ kind: 'task', columns: {} });
  const [preview, setPreview] = useState<NotionPreview>();
  const [selected, setSelected] = useState<number[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [summary, setSummary] = useState<NotionImportSummary>();
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const dateFormat = new Intl.DateTimeFormat('ko-KR', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const showDate = (value: string | null) => (value ? dateFormat.format(new Date(value)) : '미상');
  const resetPreview = () => {
    setPreview(undefined);
    setSelected([]);
    setConfirmed(false);
    setSummary(undefined);
    setError(undefined);
  };
  const input = (): NotionRequest => ({ text, format, mapping });
  function load(file: File | undefined) {
    resetPreview();
    setColumns([]);
    setText('');
    if (!file) return;
    if (file.size > 256 * 1024) return setError('파일은 256KiB 이하여야 합니다.');
    if (!/\.(csv|json)$/i.test(file.name)) return setError('CSV 또는 JSON 파일을 선택하세요.');
    const nextFormat = /\.json$/i.test(file.name) ? 'json' : 'csv';
    startTransition(async () => {
      let source: string;
      try {
        source = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
      } catch {
        return setError('UTF-8 파일을 읽을 수 없습니다. 파일 인코딩을 확인하세요.');
      }
      const result = await inspectNotionAction(source, nextFormat);
      if (!result.ok) return setError(result.error);
      setText(source);
      setFilename(file.name);
      setFormat(nextFormat);
      setColumns(result.data);
      setMapping(guess(result.data, mapping.kind));
    });
  }
  function showPreview() {
    setError(undefined);
    setSummary(undefined);
    setConfirmed(false);
    startTransition(async () => {
      const result = await previewNotionAction(input());
      if (!result.ok) {
        setPreview(undefined);
        return setError(result.error);
      }
      setPreview(result.data);
      setSelected(
        result.data.rows
          .filter((r) => r.disposition === 'new')
          .slice(0, 10)
          .map((r) => r.index),
      );
    });
  }
  function save() {
    if (!preview || !confirmed) return;
    setError(undefined);
    startTransition(async () => {
      const result = await importNotionAction(input(), preview.digest, selected);
      if (!result.ok) return setError(result.error);
      setSummary(result.data);
      setConfirmed(false);
      setSelected([]);
      const refreshed = await previewNotionAction(input());
      if (refreshed.ok) setPreview(refreshed.data);
    });
  }
  return (
    <div className="min-w-0 space-y-6">
      <div className="space-y-2 text-sm text-muted">
        <p>
          UTF-8 CSV 또는 JSON 배열·Notion 페이지 results JSON을 지원합니다. 파일당 256KiB·200행, 한
          번에 최대 10건을 저장합니다. 날짜 변환과 미리보기는 {timeZone} 기준입니다.
        </p>
        <p>
          이름만으로 중복이나 관계를 추정하지 않습니다. 원본 페이지 ID/URL이 필요합니다. 관계는 먼저
          가져온 페이지 ID로 연결하며, 같은 파일의 상위 프로젝트는 함께 선택할 수 있습니다.
        </p>
        <p>
          활동처 → 상시 활동, 상위 → 하위 프로젝트 → 할 일 순서로 가져오세요. 원본에 ID가 없는 CSV는
          ID/URL 열을 추가한 뒤 업로드하세요. 날짜는 YYYY-MM-DD, 일시는 시간대가 포함된 ISO
          형식입니다.
        </p>
        <p>
          같은 원본은 건너뛰고, 변경된 원본도 기존 데이터를 덮어쓰지 않습니다. 원본 속성과 매핑은
          가져오기 이력 및 공간 백업에 보존합니다. Notion에 데이터를 쓰지 않습니다.
        </p>
        <a href="/samples/notion-tasks.csv" download className="text-accent">
          예제 CSV 다운로드
        </a>
      </div>
      <FormMessage error={error} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="가져올 종류">
          <Select
            value={mapping.kind}
            disabled={pending}
            onChange={(e) => {
              resetPreview();
              setMapping(guess(columns, e.target.value as NotionKind));
            }}
          >
            {Object.entries(kinds).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Notion 파일">
          <Input
            type="file"
            accept=".csv,.json"
            disabled={pending}
            onChange={(e) => {
              void load(e.target.files?.[0]);
            }}
          />
        </Field>
      </div>
      {columns.length > 0 && (
        <section
          aria-label="속성 매핑"
          className="space-y-4 rounded-xl border border-border bg-surface p-4"
        >
          <h2 className="break-words font-semibold">속성 매핑 · {filename}</h2>
          <p className="text-sm text-muted">
            자동 선택된 속성을 확인하세요. 비워 둔 속성은 저장 필드로 변환하지 않고 원본으로만
            보존합니다.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {notionFieldsFor(mapping.kind).map((field) => {
              const key = field as NotionField;
              return (
                <Field key={key} label={NOTION_FIELDS[key]}>
                  <Select
                    value={mapping.columns[key] ?? ''}
                    disabled={pending}
                    onChange={(e) => {
                      resetPreview();
                      setMapping({
                        ...mapping,
                        columns: { ...mapping.columns, [key]: e.target.value },
                      });
                    }}
                  >
                    <option value="">선택하지 않음</option>
                    {columns.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </Select>
                </Field>
              );
            })}
          </div>
          <Button onClick={showPreview} disabled={pending}>
            {pending ? '처리 중…' : '매핑 미리보기'}
          </Button>
        </section>
      )}
      {preview && (
        <section aria-label="가져오기 미리보기" className="space-y-4">
          <h2 className="font-semibold">
            미리보기 · {preview.rows.length}행 · 신규{' '}
            {preview.rows.filter((r) => r.disposition === 'new').length}건
          </h2>
          {preview.ignoredColumns.length > 0 && (
            <p className="break-words text-sm text-muted">
              필드로 변환하지 않는 속성: {preview.ignoredColumns.join(', ')}
            </p>
          )}
          <ul className="space-y-3">
            {preview.rows.map((r) => (
              <li key={r.index} className="min-w-0 rounded-xl border border-border p-4">
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-1 size-4 shrink-0"
                    aria-label={`${r.index + 1}행 선택`}
                    checked={selected.includes(r.index)}
                    disabled={
                      pending ||
                      r.disposition !== 'new' ||
                      (!selected.includes(r.index) && selected.length >= 10)
                    }
                    onChange={(e) => {
                      setConfirmed(false);
                      setSelected(
                        e.target.checked
                          ? [...selected, r.index]
                          : selected.filter((i) => i !== r.index),
                      );
                    }}
                  />
                  <span className="min-w-0 break-words font-medium">
                    {r.index + 1}. {r.title || '제목 확인 필요'}{' '}
                    <span className="text-sm text-muted">· {dispositions[r.disposition]}</span>
                  </span>
                </label>
                <p className="mt-2 break-words text-sm">{r.message}</p>
                {r.values?.warnings.map((w) => (
                  <p key={w} className="mt-1 text-sm text-muted">
                    {w}
                  </p>
                ))}
                {r.values && (
                  <details className="mt-2 text-sm">
                    <summary>변환 값 확인</summary>
                    <dl className="mt-2 grid min-w-0 gap-2 break-words sm:grid-cols-2">
                      <div>
                        <dt>원본 ID</dt>
                        <dd>{r.sourceId}</dd>
                      </div>
                      {mapping.kind === 'task' && (
                        <>
                          <div>
                            <dt>상태 / 우선순위</dt>
                            <dd>
                              {r.values.status} / {r.values.priority}
                            </dd>
                          </div>
                          <div>
                            <dt>예정 기간</dt>
                            <dd>
                              {showDate(r.values.scheduledStart)} ~{' '}
                              {showDate(r.values.scheduledEnd)} ·{' '}
                              {r.values.allDay ? '종일' : '시각 지정'}
                            </dd>
                          </div>
                          <div>
                            <dt>마감 / 완료</dt>
                            <dd>
                              {showDate(r.values.dueAt)} / {showDate(r.values.completedAt)}
                            </dd>
                          </div>
                          <div>
                            <dt>태그</dt>
                            <dd>{r.values.tags.join(', ') || '없음'}</dd>
                          </div>
                        </>
                      )}
                      <div>
                        <dt>관계 원본 ID</dt>
                        <dd>
                          {Object.entries(r.values.refs)
                            .map(
                              ([k, v]) =>
                                `${NOTION_FIELDS[k as NotionField].replace(' 원본 ID', '')}: ${r.referenceNames?.[k] ?? '확인 필요'} (${v})`,
                            )
                            .join(' / ') || '없음'}
                        </dd>
                      </div>
                      <div>
                        <dt>설명</dt>
                        <dd className="whitespace-pre-wrap">{r.values.description ?? '없음'}</dd>
                      </div>
                      <div>
                        <dt>원본 생성 / 수정</dt>
                        <dd>
                          {showDate(r.values.createdAt)} / {showDate(r.values.sourceUpdatedAt)}
                        </dd>
                      </div>
                    </dl>
                  </details>
                )}
              </li>
            ))}
          </ul>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1 size-4 shrink-0"
              checked={confirmed}
              disabled={pending || !selected.length}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            선택한 행의 변환 값과 연결을 확인했습니다.
          </label>
          <Button onClick={save} disabled={pending || !confirmed || !selected.length}>
            {pending ? '처리 중…' : `선택한 ${selected.length}건 가져오기`}
          </Button>
        </section>
      )}
      {summary && (
        <section role="status" className="rounded-xl border border-border p-4">
          <h2 className="font-semibold">가져오기 결과</h2>
          <p>
            저장 {summary.created}건 · 건너뛰기 {summary.skipped}건 · 실패 {summary.failed}건
          </p>
          <ul className="mt-2 text-sm">
            {summary.rows.map((r) => (
              <li key={r.index}>
                {r.index + 1}행: {r.message}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm">
            실패한 행은 원본·관계를 수정하고 다시 미리보기를 실행하세요. 저장된 원본은 중복 생성하지
            않습니다.
          </p>
          <div className="mt-3 flex gap-4">
            <Link href="/search" className="text-accent">
              가져온 데이터 조회
            </Link>
            <Link href="/settings" className="text-accent">
              공간 데이터 백업
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
