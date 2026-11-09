import type { Metadata } from 'next';
import { requireSession } from '@/server/auth/session';
import { ResetPasswordForm } from '../password-forms';

export const metadata: Metadata = { title: '새 비밀번호' };

/** 재설정 메일 링크(/auth/confirm)로 로그인된 뒤 도착한다. 로그인한 사용자의 비밀번호 변경에도 쓴다. */
export default async function ResetPasswordPage() {
  const { user } = await requireSession();
  return <ResetPasswordForm email={user.email} />;
}
