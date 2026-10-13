'use client';

import { useState, useTransition } from 'react';
import { updateProfileAction } from '@/server/actions/account';
import { Button } from '../ui/button';
import { Field, Input, Select } from '../ui/field';
import { FormMessage } from '../ui/form-message';

const TIMEZONES = [
  'Asia/Seoul',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Singapore',
  'Europe/London',
  'Europe/Berlin',
  'America/New_York',
  'America/Los_Angeles',
  'UTC',
];

export function ProfileForm({
  name,
  email,
  timezone,
  notifyEmail,
  mailConfigured,
}: {
  name: string;
  email: string;
  timezone: string;
  notifyEmail: boolean;
  mailConfigured: boolean;
}) {
  const [state, setState] = useState<{ error?: string; message?: string }>({});
  const [pending, startTransition] = useTransition();
  const zones = TIMEZONES.includes(timezone) ? TIMEZONES : [timezone, ...TIMEZONES];

  return (
    <form
      action={(form) =>
        startTransition(async () => {
          const res = await updateProfileAction(form);
          setState(res.ok ? { message: '저장했습니다.' } : { error: res.error });
        })
      }
      className="max-w-md space-y-4"
    >
      <FormMessage {...state} />
      <Field label="이름">
        <Input name="name" required defaultValue={name} maxLength={100} />
      </Field>
      <Field label="이메일">
        <Input value={email} disabled readOnly />
      </Field>
      <Field label="시간대">
        <Select name="timezone" defaultValue={timezone}>
          {zones.map((z) => (
            <option key={z} value={z}>
              {z}
            </option>
          ))}
        </Select>
      </Field>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="notifyEmail"
          defaultChecked={notifyEmail}
          className="mt-0.5 size-4 accent-accent"
        />
        <span>
          자동화 알림을 이메일로도 받기
          {!mailConfigured && (
            <span className="block text-xs text-muted">
              이메일 발송이 아직 설정되지 않아 앱 내 알림만 전송됩니다 (RESEND_API_KEY, EMAIL_FROM
              필요).
            </span>
          )}
        </span>
      </label>
      <Button type="submit" disabled={pending}>
        {pending ? '저장 중…' : '저장'}
      </Button>
    </form>
  );
}
