import type { Metadata } from 'next';
import { connection } from 'next/server';
import { authMode } from '@/server/auth/mode';
import { ForgotPasswordForm } from '../password-forms';

export const metadata: Metadata = { title: '비밀번호 찾기' };

export default async function ForgotPasswordPage() {
  await connection(); // 인증 모드는 실행 시 환경 변수로 정해진다
  return <ForgotPasswordForm devMode={authMode() === 'dev'} />;
}
