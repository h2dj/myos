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
}: {
  name: string;
  email: string;
  timezone: string;
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
      <Button type="submit" disabled={pending}>
        {pending ? '저장 중…' : '저장'}
      </Button>
    </form>
  );
}
