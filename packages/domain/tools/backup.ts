import { readFile, stat } from 'node:fs/promises';
import {
  exportWorkspaceBackup,
  restoreBackupForVerification,
  parseWorkspaceBackup,
  MAX_BACKUP_BYTES,
  ValidationError,
} from '../src';
import { withIsolatedDb } from './isolated-db';
import { seedRehearsal } from './fixture';

try {
  const arg = process.argv[2];
  if (!arg || process.argv.length !== 3)
    throw new ValidationError('사용법: backup:verify <JSON 파일> 또는 backup:rehearse');
  if (arg === '--rehearse') {
    const report = await withIsolatedDb(async (source) => {
      const { actor, workspaceId } = await seedRehearsal(source.db);
      const text = JSON.stringify(await exportWorkspaceBackup(source.db, actor, workspaceId));
      return withIsolatedDb(async (target) => {
        const result = await restoreBackupForVerification(target.db, text);
        let overwriteRejected = false;
        try {
          await restoreBackupForVerification(target.db, text);
        } catch (err) {
          overwriteRejected = err instanceof ValidationError;
        }
        if (!overwriteRejected) throw new Error('빈 DB 보호 실패');
        return {
          ...result,
          overwriteRejected,
          source: 'synthetic-fixture',
          target: 'ephemeral-local-postgres16',
        };
      });
    });
    console.log(JSON.stringify(report, null, 2));
  } else {
    if (!(await stat(arg)).isFile() || (await stat(arg)).size > MAX_BACKUP_BYTES)
      throw new ValidationError('20MiB 이하의 JSON 파일이 필요합니다.');
    const text = await readFile(arg, 'utf8');
    parseWorkspaceBackup(text); // DB를 만들기 전에 파일 검증
    console.log(
      JSON.stringify(
        await withIsolatedDb((conn) => restoreBackupForVerification(conn.db, text)),
        null,
        2,
      ),
    );
  }
} catch (err) {
  // DB 오류·명령 인수·백업 내용은 출력하지 않는다.
  console.error(
    err instanceof ValidationError
      ? err.message
      : '복원 검증에 실패했습니다. Docker 실행 상태와 파일 형식을 확인하세요. 원본 DB는 사용하지 않았습니다.',
  );
  process.exitCode = 1;
}
