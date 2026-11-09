'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { FormMessage } from '@/components/ui/form-message';
import { requestPasswordReset, updatePassword, type AuthFormState } from './actions';

export function ForgotPasswordForm({ devMode }: { devMode: boolean }) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(
    requestPasswordReset,
    {},
  );
  return (
    <form action={action} className="space-y-4">
      <h1 className="text-lg font-bold">비밀번호 찾기</h1>
      <p className="text-sm text-muted">
        가입한 이메일을 입력하면 비밀번호를 다시 정할 수 있는 링크를 보내드립니다.
      </p>
      {devMode && (
        <p className="rounded-lg bg-surface-muted px-3 py-2 text-xs text-muted">
          개발 모드: 메일을 보내지 않습니다.
        </p>
      )}
      <FormMessage error={state.error} message={state.message} />
      <Field label="이메일">
        <Input
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          defaultValue={state.email}
        />
      </Field>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? '처리 중…' : '재설정 링크 받기'}
      </Button>
      <p className="text-center text-sm text-muted">
        <Link href="/login" className="font-medium text-accent">
          로그인으로 돌아가기
        </Link>
      </p>
    </form>
  );
}

export function ResetPasswordForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(updatePassword, {});
  return (
    <form action={action} className="space-y-4">
      <h1 className="text-lg font-bold">새 비밀번호 정하기</h1>
      <p className="text-sm text-muted">{email} 계정의 새 비밀번호를 입력하세요.</p>
      <FormMessage error={state.error} message={state.message} />
      <Field label="새 비밀번호">
        <Input
          name="password"
          type="password"
          required
          minLength={8}
          maxLength={72}
          autoComplete="new-password"
          placeholder="8자 이상 입력"
        />
      </Field>
      <Field label="새 비밀번호 확인">
        <Input
          name="confirm"
          type="password"
          required
          minLength={8}
          maxLength={72}
          autoComplete="new-password"
        />
      </Field>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? '저장 중…' : '비밀번호 변경'}
      </Button>
      <p className="text-center text-sm text-muted">
        <Link href="/dashboard" className="font-medium text-accent">
          대시보드로 이동
        </Link>
      </p>
    </form>
  );
}
