import { Logo } from '@/components/logo';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-b from-background to-accent-soft/40 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-2 text-center">
          <div className="scale-150">
            <Logo />
          </div>
          <p className="mt-3 text-sm text-muted">
            나의 모든 것을 한 곳에서
            <br />
            계획하고, 기록하고, 확장하는 개인 OS
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">{children}</div>
      </div>
    </div>
  );
}
