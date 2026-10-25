'use client';

import { useRef, useState, useTransition } from 'react';
import {
  LIFE_FRAMEWORKS,
  comparableLifeReviews,
  shiftCalendarDate,
  type LifeAreaInput,
  type LifeBalanceInput,
  type LifeBalanceSnapshot,
  type LifeFramework,
} from '@myos/core';
import type { listLifeReviews, previewLifeBalance } from '@myos/domain';
import {
  previewLifeBalanceAction,
  saveLifeBalanceAction,
  deleteLifeReviewAction,
} from '@/server/actions/life-balance';
import { Button } from '../ui/button';
import { Field, Input, Select, Textarea } from '../ui/field';
import { FormMessage } from '../ui/form-message';

type Review = Awaited<ReturnType<typeof listLifeReviews>>[number];
type Preview = Awaited<ReturnType<typeof previewLifeBalance>>;
type Draft = Omit<LifeBalanceInput, 'areas'> & {
  areas: (Omit<LifeAreaInput, 'selfScore'> & { selfScore: number | null })[];
};

function newDraft(
  framework: LifeFramework,
  today: string,
  previous: LifeBalanceInput | undefined,
  activeIds: string[],
): Draft {
  return {
    framework,
    from: shiftCalendarDate(today, -29),
    to: today,
    selfWeight: previous?.selfWeight ?? 70,
    reflection: '',
    nextAction: '',
    areas: LIFE_FRAMEWORKS[framework].areas.map((area) => {
      const saved = previous?.areas.find((a) => a.id === area.id);
      return {
        id: area.id,
        selfScore: null,
        target: saved?.target ?? 4,
        tag: saved?.tag ?? `${framework === 'wheel' ? '삶' : 'PERMA'}:${area.label}`,
        activityIds: (saved?.activityIds ?? []).filter((id) => activeIds.includes(id)),
      };
    }),
  };
}

export function LifeBalanceView({
  activities,
  reviews,
  today,
  timeZone,
}: {
  activities: { id: string; name: string }[];
  reviews: Review[];
  today: string;
  timeZone: string;
}) {
  const [draft, setDraft] = useState(() =>
    newDraft(
      'wheel',
      today,
      reviews.find((r) => r.snapshot.input.framework === 'wheel')?.snapshot.input,
      activities.map((a) => a.id),
    ),
  );
  const [preview, setPreview] = useState<Preview>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<string>('');
  const requestId = useRef<string | null>(null);
  const framework = LIFE_FRAMEWORKS[draft.framework];
  function change(next: Draft) {
    setDraft(next);
    setPreview(undefined);
    setError(undefined);
    setNotice(undefined);
    requestId.current = null;
  }
  function areaChange(index: number, patch: Partial<Draft['areas'][number]>) {
    change({ ...draft, areas: draft.areas.map((a, i) => (i === index ? { ...a, ...patch } : a)) });
  }
  function evaluate() {
    setError(undefined);
    setNotice(undefined);
    if (draft.areas.some((a) => a.selfScore === null)) {
      setError('모든 영역의 자기평가를 입력하세요. 미입력은 0점으로 처리하지 않습니다.');
      return;
    }
    startTransition(async () => {
      const res = await previewLifeBalanceAction(draft);
      if (!res.ok) return setError(res.error);
      setPreview(res.data);
    });
  }
  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-surface p-4 text-sm space-y-2">
        <h2 className="font-semibold">나에게 맞는 점검 방법</h2>
        <p>
          <strong>Wheel of Life</strong> — 삶의 여러 영역을 넓게 살펴보는 기본 회고.{' '}
          <a
            className="text-accent underline"
            href={LIFE_FRAMEWORKS.wheel.source}
            target="_blank"
            rel="noreferrer"
          >
            방법 소개
          </a>
        </p>
        <p>
          <strong>PERMA 기반 회고</strong> — 긍정정서·몰입·관계·의미·성취를 살펴보는 선택지.{' '}
          <a
            className="text-accent underline"
            href={LIFE_FRAMEWORKS.perma.source}
            target="_blank"
            rel="noreferrer"
          >
            이론 소개
          </a>
        </p>
        <p>
          <strong>가치와 작은 실천</strong> — 어느 프레임워크에서든 중요한 가치와 다음 행동을
          기록합니다.{' '}
          <a
            className="text-accent underline"
            href="https://contextualscience.org/about_act"
            target="_blank"
            rel="noreferrer"
          >
            ACT 관점 참고
          </a>
        </p>
        <p className="text-muted">
          이 앱의 질문과 합산 방식은 개인 회고용으로 구성했습니다. 표준 PERMA-Profiler나 임상 진단
          검사가 아닙니다. 모든 영역이 같은 점수일 필요는 없습니다.
        </p>
      </section>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          evaluate();
        }}
        className="space-y-4"
      >
        <fieldset disabled={pending} className="space-y-4">
          <legend className="mb-3 text-lg font-semibold">새 회고</legend>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="프레임워크">
              <Select
                value={draft.framework}
                onChange={(e) => {
                  const next = e.target.value as LifeFramework;
                  change(
                    newDraft(
                      next,
                      today,
                      reviews.find((r) => r.snapshot.input.framework === next)?.snapshot.input,
                      activities.map((a) => a.id),
                    ),
                  );
                }}
              >
                <option value="wheel">Wheel of Life</option>
                <option value="perma">PERMA 기반 회고</option>
              </Select>
            </Field>
            <Field label="시작일">
              <Input
                type="date"
                required
                min="1900-01-01"
                max={draft.to}
                value={draft.from}
                onChange={(e) => change({ ...draft, from: e.target.value })}
              />
            </Field>
            <Field label="종료일">
              <Input
                type="date"
                required
                min={draft.from}
                max={today}
                value={draft.to}
                onChange={(e) => change({ ...draft, to: e.target.value })}
              />
            </Field>
            <Field label="자기평가 비중 (%)">
              <Input
                type="number"
                required
                min={0}
                max={100}
                step={1}
                value={draft.selfWeight}
                onChange={(e) => change({ ...draft, selfWeight: e.target.valueAsNumber })}
              />
            </Field>
          </div>
          <div className="flex flex-wrap gap-2">
            {[7, 30, 90].map((days) => (
              <Button
                key={days}
                variant="secondary"
                onClick={() =>
                  change({ ...draft, from: shiftCalendarDate(today, 1 - days), to: today })
                }
              >
                최근 {days}일
              </Button>
            ))}
          </div>
          <p className="text-sm text-muted">
            {framework.description} 프레임워크 변경 시 입력이 초기화됩니다. 기간을 바꿨다면 목표
            건수도 맞춰 주세요. 기본 목표는 영역당 4건이며 자기평가에는 초기 점수가 없습니다.
          </p>
          <p className="text-sm text-muted">
            개인 공간의 완료 시각 기준으로 집계합니다 ({timeZone}). 삭제·미완료·취소 항목은
            제외합니다. 기록이 없는 활동은 파악할 수 없으므로, 활동 점수는 실제 삶의 질을 뜻하지
            않습니다.
          </p>
          <div className="grid gap-4 lg:grid-cols-2">
            {framework.areas.map((area, index) => {
              const value = draft.areas[index]!;
              return (
                <section
                  key={area.id}
                  className="rounded-xl border border-border bg-surface p-4 space-y-3"
                  aria-label={`${area.label} 평가`}
                >
                  <h3 className="font-semibold">{area.label}</h3>
                  <p className="text-sm text-muted">{area.question}</p>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label={`${area.label} 자기평가 (0~10)`}>
                      <Input
                        type="number"
                        min={0}
                        max={10}
                        step={0.1}
                        required
                        placeholder="직접 입력"
                        value={value.selfScore ?? ''}
                        onChange={(e) =>
                          areaChange(index, {
                            selfScore: e.target.value === '' ? null : e.target.valueAsNumber,
                          })
                        }
                      />
                    </Field>
                    <Field label={`${area.label} 활동 목표 (건)`}>
                      <Input
                        type="number"
                        min={1}
                        max={10000}
                        step={1}
                        required
                        value={value.target}
                        onChange={(e) => areaChange(index, { target: e.target.valueAsNumber })}
                      />
                    </Field>
                  </div>
                  <Field label={`${area.label} 연결 태그`}>
                    <Input
                      maxLength={100}
                      value={value.tag}
                      onChange={(e) => areaChange(index, { tag: e.target.value })}
                      placeholder="기존 할 일의 태그와 정확히 일치"
                    />
                  </Field>
                </section>
              );
            })}
          </div>
          <details className="rounded-xl border border-border bg-surface p-4">
            <summary className="cursor-pointer font-semibold">
              상시 활동을 영역에 연결 ({activities.length}개)
            </summary>
            <p className="my-2 text-sm text-muted">
              태그 대신 기존 활동으로 연결할 수도 있습니다. 한 할 일이 여러 영역에 걸리면 중복
              합산하지 않고 분류 충돌로 표시합니다.
            </p>
            {activities.length === 0 && (
              <p className="text-sm text-muted">
                등록된 상시 활동이 없습니다. 위 연결 태그를 할 일에 붙여 분류할 수 있습니다.
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              {activities.map((activity) => (
                <Field key={activity.id} label={`${activity.name} 영역`}>
                  <Select
                    value={draft.areas.find((a) => a.activityIds.includes(activity.id))?.id ?? ''}
                    onChange={(e) =>
                      change({
                        ...draft,
                        areas: draft.areas.map((a) => ({
                          ...a,
                          activityIds: [
                            ...a.activityIds.filter((id) => id !== activity.id),
                            ...(a.id === e.target.value ? [activity.id] : []),
                          ],
                        })),
                      })
                    }
                  >
                    <option value="">연결 안 함</option>
                    {framework.areas.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              ))}
            </div>
          </details>
          <Field label="중요한 가치와 이번 기간의 느낌">
            <Textarea
              value={draft.reflection}
              maxLength={3000}
              rows={3}
              onChange={(e) => change({ ...draft, reflection: e.target.value })}
              placeholder="어떤 가치가 중요했나요? 기록만으로 설명되지 않는 경험도 적어 보세요."
            />
          </Field>
          <Field label="다음에 할 작은 행동">
            <Textarea
              value={draft.nextAction}
              maxLength={1000}
              rows={2}
              onChange={(e) => change({ ...draft, nextAction: e.target.value })}
              placeholder="다음 기간에 실천할 작고 구체적인 행동 한 가지"
            />
          </Field>
          <FormMessage error={error} />
          <Button type="submit" disabled={pending}>
            {pending ? '계산 중…' : '활동 불러오고 점수 계산'}
          </Button>
        </fieldset>
      </form>
      {preview && (
        <section aria-label="현재 회고 결과" className="space-y-4">
          <ScoreResult snapshot={preview.snapshot} previous={reviews.map((r) => r.snapshot)} />
          <details className="rounded-xl border border-border p-4">
            <summary className="cursor-pointer font-semibold">
              집계 근거 확인 ({preview.snapshot.totalCompleted}건)
            </summary>
            <p className="mt-2 text-sm text-muted">
              최근 완료 100건까지 표시합니다. 점수는 기간의 모든 완료 기록(최대 10,000건)을
              집계합니다.
            </p>
            {preview.evidence.length === 0 && (
              <p className="mt-2 text-sm">
                이 기간의 완료 기록이 없습니다. 자기평가만으로 점수를 계산합니다.
              </p>
            )}
            <ul className="mt-3 divide-y divide-border">
              {preview.evidence.map((task) => (
                <li key={task.id} className="py-2 text-sm break-words">
                  <a className="underline" href={`/tasks/${task.id}`}>
                    {task.title}
                  </a>{' '}
                  ·{' '}
                  {task.areaId === 'conflict'
                    ? '분류 충돌'
                    : (preview.snapshot.areas.find((a) => a.id === task.areaId)?.label ??
                      '미분류')}{' '}
                  ·{' '}
                  {new Intl.DateTimeFormat('ko-KR', { timeZone, dateStyle: 'short' }).format(
                    new Date(task.completedAt),
                  )}
                </li>
              ))}
            </ul>
          </details>
          <p className="text-xs text-muted">
            저장 시 최신 활동으로 다시 집계합니다. 저장한 점수는 이후 할 일이 수정되어도 유지됩니다.
          </p>
          <Button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setError(undefined);
                requestId.current ??= crypto.randomUUID();
                const res = await saveLifeBalanceAction(draft, requestId.current);
                if (!res.ok) return setError(res.error);
                setPreview(undefined);
                setNotice('회고를 저장했습니다.');
                setSelected(res.data.id);
              })
            }
          >
            회고 저장
          </Button>
        </section>
      )}
      <FormMessage error={error} />
      {notice && (
        <p role="status" className="text-sm text-success">
          {notice}
        </p>
      )}
      <section className="space-y-4" aria-label="저장된 회고">
        <h2 className="text-lg font-semibold">저장된 회고</h2>
        {reviews.length === 0 ? (
          <p className="text-sm text-muted">아직 저장한 회고가 없습니다.</p>
        ) : (
          <>
            <Field label="회고 기록 선택">
              <Select value={selected} onChange={(e) => setSelected(e.target.value)}>
                <option value="">기록 선택 (최근 50개)</option>
                {reviews.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.snapshot.input.from} ~ {r.snapshot.input.to} ·{' '}
                    {LIFE_FRAMEWORKS[r.snapshot.input.framework].name} ·{' '}
                    {r.snapshot.combined.toFixed(1)}점 ·{' '}
                    {new Intl.DateTimeFormat('ko-KR', {
                      timeZone,
                      dateStyle: 'short',
                      timeStyle: 'short',
                    }).format(new Date(r.createdAt))}
                  </option>
                ))}
              </Select>
            </Field>
            {reviews
              .filter((r) => r.id === selected)
              .map((review) => (
                <div key={review.id} className="space-y-3">
                  <ScoreResult
                    snapshot={review.snapshot}
                    previous={reviews.filter((r) => r.id !== review.id).map((r) => r.snapshot)}
                  />
                  <p className="whitespace-pre-wrap break-words text-sm">
                    <strong>가치와 느낌:</strong> {review.snapshot.input.reflection || '기록 없음'}
                  </p>
                  <p className="whitespace-pre-wrap break-words text-sm">
                    <strong>다음 작은 행동:</strong>{' '}
                    {review.snapshot.input.nextAction || '기록 없음'}
                  </p>
                  <Button
                    variant="secondary"
                    disabled={pending}
                    onClick={() => {
                      if (!window.confirm('이 회고 기록을 삭제할까요? 삭제 후 되돌릴 수 없습니다.'))
                        return;
                      startTransition(async () => {
                        const res = await deleteLifeReviewAction(review.id);
                        if (!res.ok) return setError(res.error);
                        setSelected('');
                        setNotice('회고를 삭제했습니다.');
                      });
                    }}
                  >
                    이 회고 삭제
                  </Button>
                </div>
              ))}
          </>
        )}
      </section>
    </div>
  );
}

function ScoreResult({
  snapshot,
  previous,
}: {
  snapshot: LifeBalanceSnapshot;
  previous: LifeBalanceSnapshot[];
}) {
  const prior = previous
    .filter((p) => comparableLifeReviews(snapshot, p))
    .sort((a, b) => b.input.to.localeCompare(a.input.to))[0];
  const lowestScore = Math.min(...snapshot.areas.map((a) => a.combined));
  const lowest = snapshot.areas
    .filter((a) => a.combined === lowestScore)
    .map((a) => a.label)
    .join(' · ');
  return (
    <div className="rounded-xl border border-border bg-surface p-4 space-y-4">
      <h3 className="font-semibold">
        {LIFE_FRAMEWORKS[snapshot.input.framework].name} · {snapshot.input.from} ~{' '}
        {snapshot.input.to}
      </h3>
      <div className="grid grid-cols-3 gap-2 text-center">
        {(
          [
            ['자기평가', snapshot.selfScore],
            ['활동 점수', snapshot.activityScore],
            ['합산 점수', snapshot.combined],
          ] as const
        ).map(([label, score]) => (
          <div key={label} className="rounded-lg bg-surface-muted p-3">
            <p className="text-xs text-muted">{label}</p>
            <p className="text-xl font-semibold">
              {score === null ? (
                <span className="text-sm">기록 없음</span>
              ) : (
                <>
                  {score.toFixed(1)}
                  <span className="text-xs text-muted"> / 10</span>
                </>
              )}
            </p>
          </div>
        ))}
      </div>
      <p className="text-sm text-muted">
        활동 점수 = min(완료 건수 ÷ 나의 목표, 1) × 10. 영역별 합산 = 자기평가 ×{' '}
        {snapshot.input.selfWeight}% + 활동 점수 × {100 - snapshot.input.selfWeight}%. 전체 점수는
        영역별 평균입니다. 활동 기록이 없는 영역은 비중 설정과 관계없이 자기평가를 100% 반영합니다.
        활동 평균은 기록이 있는 영역만 포함합니다.
      </p>
      <p className="text-sm">
        완료 기록 {snapshot.totalCompleted}건 · 미분류 {snapshot.unclassified}건 (분류 충돌{' '}
        {snapshot.conflicts}건 포함). 미분류는 점수에 넣지 않습니다.
      </p>
      {prior ? (
        <p className="text-sm">
          이전 비교 기간 ({prior.input.from} ~ {prior.input.to}) 대비 합산{' '}
          {(snapshot.combined - prior.combined).toFixed(1)}점 변화
        </p>
      ) : (
        <p className="text-xs text-muted">
          같은 프레임워크·목표·연결·비중·시간대·기간 길이의 이전 비중복 기록이 쌓이면 변화를
          비교합니다.
        </p>
      )}
      <details className="text-sm">
        <summary className="cursor-pointer">당시 집계 설정</summary>
        <p className="mt-2">시간대: {snapshot.timeZone}</p>
        <ul>
          {snapshot.input.areas.map((area) => (
            <li key={area.id}>
              {snapshot.areas.find((a) => a.id === area.id)?.label}: 태그 {area.tag || '없음'} ·
              연결 활동 {area.activityIds.length}개 · 목표 {area.target}건
            </li>
          ))}
        </ul>
      </details>
      <p className="text-xs text-muted">활동 차트는 기록이 있는 영역만 표시합니다.</p>
      <Radar snapshot={snapshot} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[500px] text-sm">
          <caption className="sr-only">영역별 자기평가·활동·합산 점수</caption>
          <thead>
            <tr className="border-b border-border text-left">
              <th className="p-2">영역</th>
              <th>자기평가</th>
              <th>완료 / 목표</th>
              <th>활동</th>
              <th>합산</th>
            </tr>
          </thead>
          <tbody>
            {snapshot.areas.map((area) => (
              <tr key={area.id} className="border-b border-border">
                <th className="p-2 text-left font-medium">{area.label}</th>
                <td>{area.selfScore.toFixed(1)}</td>
                <td>
                  {area.completed} / {area.target}
                </td>
                <td>{area.activityScore === null ? '미반영' : area.activityScore.toFixed(1)}</td>
                <td className="font-semibold">
                  {area.combined.toFixed(1)}
                  {area.activityScore === null && (
                    <span className="block text-xs font-normal text-muted">자기평가만</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-sm">
        돌아볼 영역: <strong>{lowest}</strong>. 낮은 점수의 이유와 지금 중요한 가치를 함께
        살펴보세요.
      </p>
      <p className="text-xs text-muted">
        활동량은 작업 크기·시간·질을 반영하지 않습니다. 이 합산 점수는 앱의 회고 지표이며
        프레임워크의 공식 점수가 아닙니다. 활동 기록이 없는 영역은 자기평가만 반영합니다.
      </p>
    </div>
  );
}

function Radar({ snapshot }: { snapshot: LifeBalanceSnapshot }) {
  const [showSelf, setShowSelf] = useState(true);
  const [showActivity, setShowActivity] = useState(true);
  const [showCombined, setShowCombined] = useState(true);
  const point = (i: number, score: number, radius = 110) => {
    const angle = (i * 2 * Math.PI) / snapshot.areas.length - Math.PI / 2;
    return [
      200 + (Math.cos(angle) * radius * score) / 10,
      175 + (Math.sin(angle) * radius * score) / 10,
    ];
  };
  const polygon = (value: (i: number) => number) =>
    snapshot.areas.map((_, i) => point(i, value(i)).join(',')).join(' ');
  return (
    <figure className="mx-auto max-w-lg">
      <svg
        viewBox="0 0 400 350"
        role="img"
        aria-label="삶의 균형 레이더 차트: 점수는 아래 표에서도 확인할 수 있습니다."
        className="w-full"
      >
        {[2, 4, 6, 8, 10].map((level) => (
          <g key={level}>
            <polygon
              points={polygon(() => level)}
              fill="none"
              stroke="currentColor"
              opacity={0.15}
            />
            <text x={204} y={175 - level * 11} fontSize={9} fill="currentColor">
              {level}
            </text>
          </g>
        ))}
        {snapshot.areas.map((area, i) => {
          const p = point(i, 10);
          const label = point(i, 10, 145);
          return (
            <g key={area.id}>
              <line x1={200} y1={175} x2={p[0]} y2={p[1]} stroke="currentColor" opacity={0.15} />
              <text
                x={label[0]}
                y={label[1]}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={12}
                fill="currentColor"
              >
                {area.label}
              </text>
            </g>
          );
        })}
        {showActivity && (
          <g>
            {snapshot.areas.every((area) => area.activityScore !== null) && (
              <polygon
                points={polygon((i) => snapshot.areas[i]!.activityScore!)}
                fill="#059669"
                fillOpacity={0.08}
                stroke="#059669"
                strokeWidth={2}
                strokeDasharray="3 3"
              />
            )}
            {snapshot.areas.map((area, i) => {
              if (area.activityScore === null) return null;
              const p = point(i, area.activityScore);
              return (
                <circle key={area.id} cx={p[0]} cy={p[1]} r={4} fill="#059669">
                  <title>
                    {area.label} 활동 {area.activityScore.toFixed(1)}
                  </title>
                </circle>
              );
            })}
          </g>
        )}
        {showSelf && (
          <polygon
            points={polygon((i) => snapshot.areas[i]!.selfScore)}
            fill="#d97706"
            fillOpacity={0.08}
            stroke="#d97706"
            strokeWidth={2}
            strokeDasharray="7 3"
          />
        )}
        {showCombined && (
          <polygon
            points={polygon((i) => snapshot.areas[i]!.combined)}
            fill="#6366f1"
            fillOpacity={0.15}
            stroke="#6366f1"
            strokeWidth={2}
          />
        )}
      </svg>
      <figcaption className="flex flex-wrap justify-center gap-4 text-xs">
        {(
          [
            ['자기평가 (긴 점선)', showSelf, setShowSelf],
            ['활동 (초록 점·점선)', showActivity, setShowActivity],
            ['합산 (실선)', showCombined, setShowCombined],
          ] as const
        ).map(([label, checked, set]) => (
          <label key={label} className="flex items-center gap-1">
            <input type="checkbox" checked={checked} onChange={(e) => set(e.target.checked)} />
            {label}
          </label>
        ))}
      </figcaption>
    </figure>
  );
}
