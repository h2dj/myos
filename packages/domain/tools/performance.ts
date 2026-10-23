import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { schema } from '@myos/db';
import { percentiles, summarizeTimings } from '@myos/core';
import { createTask, listTasks, listProjects, listProjectOptions } from '../src';
import { withIsolatedDb } from './isolated-db';
import { seedRehearsal } from './fixture';

try {
  const file = process.argv[2];
  if (file !== '--benchmark') {
    if (!file) throw new Error('사용법: perf:report <JSONL 로그 파일>');
    const events: unknown[] = [];
    for (const line of (await readFile(file, 'utf8')).split('\n')) {
      try {
        const event = JSON.parse(line);
        events.push(event);
        if (typeof event?.message === 'string') {
          try {
            events.push(JSON.parse(event.message));
          } catch {
            /* 다른 로그 */
          }
        }
      } catch {
        /* 다른 로그 */
      }
    }
    const groups = summarizeTimings(events);
    if (!groups.length) throw new Error('측정 로그가 없습니다.');
    console.log(JSON.stringify({ groups }, null, 2));
  } else {
    let statements = 0;
    const logger = {
      logQuery() {
        statements++;
      },
    };
    const report = await withIsolatedDb(async (conn) => {
      const { db } = conn;
      const { actor, workspaceId } = await seedRehearsal(db);
      const projects = Array.from({ length: 100 }, (_, n) => ({
        id: randomUUID(),
        workspaceId,
        name: `측정 프로젝트 ${n}`,
        createdBy: actor.userId,
      }));
      await db.insert(schema.projects).values(projects);
      for (let n = 0; n < 4; n++)
        await db.insert(schema.tasks).values(
          Array.from({ length: 500 }, (_, i) => ({
            workspaceId,
            title: '측정 항목',
            projectId: projects[(n * 500 + i) % 100]!.id,
            createdBy: actor.userId,
            status: i % 3 ? ('todo' as const) : ('done' as const),
          })),
        );
      const sample = async (name: string, fn: () => Promise<unknown>) => {
        for (let n = 0; n < 5; n++) await fn();
        const durations: number[] = [],
          queries: number[] = [];
        for (let n = 0; n < 30; n++) {
          const count = statements,
            start = performance.now();
          await fn();
          durations.push(performance.now() - start);
          queries.push(statements - count);
        }
        return {
          operation: name,
          ...percentiles(durations),
          minStatements: Math.min(...queries),
          maxStatements: Math.max(...queries),
        };
      };
      const before = await sample('projects.before', () =>
        listProjects(db, actor, { workspaceId }),
      );
      const after = await sample('projects.options.after', () =>
        listProjectOptions(db, actor, workspaceId),
      );
      const list = await sample('tasks.list', () =>
        listTasks(db, actor, { workspaceId, limit: 500 }),
      );
      const save = await sample('tasks.create', () =>
        createTask(db, actor, { workspaceId, title: '측정 저장' }),
      );
      if (after.maxStatements >= before.minStatements) throw new Error('집계 쿼리 감소 검증 실패');
      return {
        environment: 'ephemeral-local-postgres16',
        workload: { projects: 103, seededTasks: 2006, warmup: 5, samples: 30 },
        before,
        after,
        list,
        save,
        statementReductionVerified: true,
      };
    }, logger);
    console.log(JSON.stringify(report, null, 2));
  }
} catch {
  console.error('성능 보고서를 만들지 못했습니다. Docker 또는 측정 로그 형식을 확인하세요.');
  process.exitCode = 1;
}
