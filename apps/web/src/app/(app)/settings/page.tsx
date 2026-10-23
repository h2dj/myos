import type { Metadata } from 'next';
import { logout } from '@/app/(auth)/actions';
import { ProfileForm } from '@/components/account/profile-form';
import { PageHeader } from '@/components/page-header';
import { buttonClass } from '@/components/ui/button';
import { requireSession } from '@/server/auth/session';
import { engineDeps } from '@/server/engine';

export const metadata: Metadata = { title: '설정' };

const LATER = [
  { title: '연동 서비스', note: 'Notion 가져오기 · Google Calendar — 4단계에서 제공' },
];

export default async function SettingsPage() {
  const { user, workspace, workspaces } = await requireSession();
  return (
    <>
      <PageHeader title="설정" description="계정·알림·연동·데이터를 관리합니다." />
      <div className="space-y-6">
        <section className="rounded-xl border border-border bg-surface p-6">
          <h2 className="mb-4 font-semibold">내 계정</h2>
          <ProfileForm
            name={user.name}
            email={user.email}
            timezone={user.timezone}
            notifyEmail={user.notifyEmail}
            mailConfigured={engineDeps().mailer.channel !== 'none'}
          />
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
        <section className="rounded-xl border border-border bg-surface p-6">
          <h2 className="mb-3 font-semibold">데이터 관리</h2>
          <p className="mb-3 text-sm text-muted">
            현재 공간의 프로젝트·할 일·노트·인박스·활동·활동처·반복 설정·태그와 연결을 JSON 파일로
            내보냅니다. 휴지통 항목도 포함됩니다.
          </p>
          <p className="mb-3 text-sm text-muted">
            이 파일은 업무 데이터 사본입니다. 로그인 계정·공유 멤버·개인 대시보드·알림·자동화 실행
            이력은 포함하지 않습니다. 개인적인 내용이 있으므로 안전한 곳에 보관하세요.
          </p>
          {workspace.role === 'owner' ? (
            <a href="/api/workspace-export" className={buttonClass('secondary')}>
              현재 공간 데이터 내보내기
            </a>
          ) : (
            <p className="text-sm text-muted">공간 소유자만 내보낼 수 있습니다.</p>
          )}
          <p className="mt-3 text-xs text-muted">
            복원은 개발 도구의 별도 임시 DB에서 검증합니다. 현재 공간에 덮어쓰는 기능은 제공하지
            않습니다.
          </p>
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
