import { appliedMigrationCount } from '@myos/domain';
import { NextResponse } from 'next/server';
import { authMode } from '@/server/auth/mode';
import { db } from '@/server/db';

export const dynamic = 'force-dynamic';

/** 배포 확인용: DB 연결과 마이그레이션 상태, 인증 모드 (비밀 값은 노출하지 않는다) */
export async function GET() {
  try {
    const migrations = await appliedMigrationCount(db);
    return NextResponse.json({ ok: true, migrations, auth: authMode() });
  } catch (err) {
    console.error('[health]', err);
    return NextResponse.json({ ok: false, error: 'database unavailable' }, { status: 503 });
  }
}
