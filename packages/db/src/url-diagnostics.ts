/**
 * DB 연결 문자열 점검. 비밀번호 자체는 절대 출력하지 않고, 흔한 실수만 짚는다.
 * (GitHub Actions 로그 등에서 "password authentication failed"의 원인을 찾기 위함)
 */
export interface UrlDiagnosis {
  /** 비밀 값이 빠진 요약: 사용자·호스트·포트·DB·비밀번호 길이 */
  summary: string;
  problems: string[];
}

export function diagnoseDatabaseUrl(raw: string): UrlDiagnosis {
  const problems: string[] = [];
  if (raw !== raw.trim()) {
    problems.push('값 앞뒤에 공백이나 줄바꿈이 있습니다. Secret에 문자열만 다시 붙여 넣으세요.');
  }
  const value = raw.trim();

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return {
      summary: '(URL 형식이 아님)',
      problems: [
        ...problems,
        'postgresql://사용자:비밀번호@호스트:포트/postgres 형식이 아닙니다. 비밀번호에 @ : / ? # 같은 문자가 있으면 URL 인코딩이 필요합니다.',
      ],
    };
  }

  // postgres.js와 같은 방식으로 해석한 비밀번호 (서버에 실제로 전달되는 값)
  let password = '';
  try {
    password = decodeURIComponent(url.password);
  } catch {
    problems.push('비밀번호의 % 문자가 잘못된 인코딩으로 해석됩니다. % 는 %25 로 바꿔 쓰세요.');
  }
  const user = decodeURIComponent(url.username);

  if (!password) problems.push('비밀번호가 비어 있습니다.');
  if (/YOUR-PASSWORD/i.test(password)) {
    problems.push('비밀번호 자리에 [YOUR-PASSWORD] 문구가 그대로 남아 있습니다.');
  } else if (password.startsWith('[') || password.endsWith(']')) {
    problems.push(
      '비밀번호가 대괄호 [ ] 로 감싸져 있습니다. [YOUR-PASSWORD] 를 바꿀 때 대괄호까지 지워야 합니다.',
    );
  }
  if (/%/.test(value.slice(value.indexOf('://') + 3, value.lastIndexOf('@')))) {
    problems.push(
      '비밀번호에 % 가 있습니다. % 뒤 두 글자가 16진수면 다른 문자로 바뀌어 전달됩니다. 비밀번호에 % 를 쓰지 않거나 %25 로 인코딩하세요.',
    );
  }
  if (url.hostname.endsWith('pooler.supabase.com') && !user.includes('.')) {
    problems.push('Supabase 풀러는 사용자 이름이 postgres.<프로젝트 ref> 형식이어야 합니다.');
  }
  if (url.port === '6543') {
    problems.push(
      '포트 6543(Transaction pooler)입니다. 마이그레이션·워커에는 Session pooler(5432)를 쓰세요.',
    );
  }

  return {
    summary: `user=${user} host=${url.hostname} port=${url.port || '(기본)'} db=${url.pathname.slice(1) || '(없음)'} password_length=${password.length}`,
    problems,
  };
}
