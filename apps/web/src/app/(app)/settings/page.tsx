import type { Metadata } from 'next';
import { logout } from '@/app/(auth)/actions';
import { ProfileForm } from '@/components/account/profile-form';
import { PageHeader } from '@/components/page-header';
import { buttonClass } from '@/components/ui/button';
import { requireSession } from '@/server/auth/session';

export const metadata: Metadata = { title: '설정' };

const LATER = [
  { title: '알림 설정', note: '이메일 알림 채널 — 3단계(자동화)에서 제공' },
  { title: '연동 서비스', note: 'Notion 가져오기 · Google Calendar — 4단계에서 제공' },
  { title: '데이터 관리', note: '내보내기 · 복원 — 5단계에서 제공' },
];

export default async function SettingsPage() {
  const { user, workspaces } = await requireSession();
  return (
    <>
      <PageHeader title="설정" description="계정·알림·연동·데이터를 관리합니다." />
      <div className="space-y-6">
        <section className="rounded-xl border border-border bg-surface p-6">
          <h2 className="mb-4 font-semibold">내 계정</h2>
          <ProfileForm name={user.name} email={user.email} timezone={user.timezone} />
        </section>
        <section className="rounded-xl border border-border bg-surface p-6">
          <h2 className="mb-3 font-semibold">공간</h2>
          <ul className="space-y-1 text-sm">
            {workspaces.map((w) => (
              <li key={w.id}>
                {w.name}{' '}
                <span className="text-muted">
                  · {w.type === 'personal' ? '개인' : '공유'} · {w.role}
                </span>
              </li>
            ))}
          </ul>
        </section>
        {LATER.map((s) => (
          <section
            key={s.title}
            className="rounded-xl border border-dashed border-border bg-surface p-6"
          >
            <h2 className="font-semibold">{s.title}</h2>
            <p className="mt-1 text-sm text-muted">{s.note}</p>
          </section>
        ))}
        <form action={logout}>
          <button type="submit" className={buttonClass('secondary')}>
            로그아웃
          </button>
        </form>
      </div>
    </>
  );
}
