import type { Metadata } from 'next';
import { connection } from 'next/server';
import { authMode } from '@/server/auth/mode';
import { AuthForm } from '../auth-form';

export const metadata: Metadata = { title: '회원가입' };

export default async function SignupPage() {
  await connection(); // 인증 모드는 실행 시 환경 변수로 정해진다
  return <AuthForm mode="signup" devMode={authMode() === 'dev'} />;
}
