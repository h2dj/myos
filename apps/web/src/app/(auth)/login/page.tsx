import type { Metadata } from 'next';
import { authMode } from '@/server/auth/mode';
import { AuthForm } from '../auth-form';

export const metadata: Metadata = { title: '로그인' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  return (
    <>
      {error === 'confirm' && (
        <p className="mb-4 text-sm text-danger">확인 링크가 만료되었거나 올바르지 않습니다.</p>
      )}
      <AuthForm mode="login" next={next} devMode={authMode() === 'dev'} />
    </>
  );
}
