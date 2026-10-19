import { describe, expect, it } from 'vitest';
import { diagnoseDatabaseUrl } from './url-diagnostics';

const HOST = 'aws-0-ap-northeast-1.pooler.supabase.com';

describe('diagnoseDatabaseUrl', () => {
  it('정상 문자열은 문제 없음, 비밀번호는 요약에 나오지 않는다', () => {
    const d = diagnoseDatabaseUrl(`postgresql://postgres.abc:s3cretPass@${HOST}:5432/postgres`);
    expect(d.problems).toEqual([]);
    expect(d.summary).toBe(
      `user=postgres.abc host=${HOST} port=5432 db=postgres password_length=10`,
    );
    expect(d.summary).not.toContain('s3cretPass');
  });

  it('대괄호를 남긴 경우', () => {
    const d = diagnoseDatabaseUrl(`postgresql://postgres.abc:[s3cretPass]@${HOST}:5432/postgres`);
    expect(d.problems.join()).toContain('대괄호');
  });

  it('[YOUR-PASSWORD]를 그대로 둔 경우', () => {
    const d = diagnoseDatabaseUrl(
      `postgresql://postgres.abc:[YOUR-PASSWORD]@${HOST}:5432/postgres`,
    );
    expect(d.problems.join()).toContain('YOUR-PASSWORD');
  });

  it('% 가 들어간 비밀번호', () => {
    const d = diagnoseDatabaseUrl(`postgresql://postgres.abc:ab%41cd@${HOST}:5432/postgres`);
    expect(d.problems.join()).toContain('%25');
  });

  it('앞뒤 공백·줄바꿈, 포트 6543, 사용자 형식', () => {
    const d = diagnoseDatabaseUrl(`postgresql://postgres:pw@${HOST}:6543/postgres\n`);
    const all = d.problems.join('\n');
    expect(all).toContain('줄바꿈');
    expect(all).toContain('5432');
    expect(all).toContain('postgres.<프로젝트 ref>');
  });

  it('URL 형식이 아니면', () => {
    expect(diagnoseDatabaseUrl('not a url').problems.join()).toContain('형식');
  });
});
