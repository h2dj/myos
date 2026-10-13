/** 이메일 발송 (확정 사항 #3: 앱 내 알림 + 이메일, Resend) */
export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  /** 실제 발송 채널 이름 (기록용) */
  readonly channel: 'resend' | 'none';
  send(message: MailMessage): Promise<void>;
}

/** RESEND_API_KEY가 없으면 발송하지 않는다(앱 내 알림만 남는다) */
export const noopMailer: Mailer = {
  channel: 'none',
  async send() {},
};

export function createMailer(env: Record<string, string | undefined> = process.env): Mailer {
  const apiKey = env.RESEND_API_KEY;
  const from = env.EMAIL_FROM;
  if (!apiKey || !from) return noopMailer;
  return {
    channel: 'resend',
    async send({ to, subject, text }) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to, subject, text }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`이메일 발송 실패 (${res.status}) ${body.slice(0, 200)}`);
      }
    },
  };
}
