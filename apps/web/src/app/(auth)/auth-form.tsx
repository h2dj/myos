'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { Field, Input } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { FormMessage } from '@/components/ui/form-message';
import { login, signup, type AuthFormState } from './actions';

export function AuthForm({
  mode,
  next,
  devMode,
}: {
  mode: 'login' | 'signup';
  next?: string;
  devMode: boolean;
}) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(
    mode === 'login' ? login : signup,
    {},
  );

  return (
    <form action={action} className="space-y-4">
      <h1 className="text-lg font-bold">{mode === 'login' ? '로그인' : '계정을 만들어보세요'}</h1>
      {devMode && (
        <p className="rounded-lg bg-surface-muted px-3 py-2 text-xs text-muted">
          개발 모드: 아무 이메일과 8자 이상 비밀번호로 로그인됩니다.
        </p>
      )}
      <FormMessage error={state.error} message={state.message} />
      {mode === 'signup' && (
        <Field label="이름">
          <Input name="name" required autoComplete="name" placeholder="홍길동" />
        </Field>
      )}
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
      <Field label="비밀번호">
        <Input
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          placeholder="8자 이상 입력"
        />
      </Field>
      {next && <input type="hidden" name="next" value={next} />}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? '처리 중…' : mode === 'login' ? '이메일로 로그인' : '회원가입'}
      </Button>
      <p className="text-center text-sm text-muted">
        {mode === 'login' ? (
          <>
            계정이 없으신가요?{' '}
            <Link href="/signup" className="font-medium text-accent">
              회원가입
            </Link>
          </>
        ) : (
          <>
            이미 계정이 있으신가요?{' '}
            <Link href="/login" className="font-medium text-accent">
              로그인
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
