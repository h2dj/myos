import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { createDb } from './client';
import { diagnoseDatabaseUrl } from './url-diagnostics';

const migrationsFolder = fileURLToPath(new URL('../migrations', import.meta.url));

// 연결 문자열 점검 결과를 먼저 보여준다 (비밀번호는 출력하지 않음)
const diagnosis = diagnoseDatabaseUrl(process.env.DATABASE_URL ?? '');
console.log(`[migrate] 연결 대상: ${diagnosis.summary}`);
for (const p of diagnosis.problems) console.warn(`[migrate] 확인 필요: ${p}`);

const { db, sql } = createDb(process.env.DATABASE_URL?.trim());
try {
  await migrate(db, { migrationsFolder });
  console.log('마이그레이션 완료');
} catch (err) {
  const code = (err as { cause?: { code?: string } }).cause?.code;
  if (code === '28P01') {
    console.error(
      [
        '[migrate] 비밀번호 인증 실패(28P01): 호스트와 사용자 이름은 맞고, 전달된 비밀번호가 다릅니다.',
        '  - 위 "확인 필요" 항목을 먼저 고치세요.',
        '  - GitHub Secret 위치: 이 워크플로는 Environment "production"의 MIGRATION_DATABASE_URL을 읽고,',
        '    같은 이름의 Repository secret보다 Environment secret이 우선합니다. 고친 값을 어디에 저장했는지 확인하세요.',
        '  - Supabase에서 비밀번호를 재설정했다면 풀러에 반영되기까지 몇 분 걸릴 수 있습니다.',
      ].join('\n'),
    );
  }
  throw err;
} finally {
  await sql.end();
}
