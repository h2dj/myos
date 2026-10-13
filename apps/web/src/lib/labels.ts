/**
 * 화면 표시용 라벨. 서버·클라이언트 컴포넌트 모두에서 쓰므로 'use client' 파일에 두지 않는다
 * ('use client' 모듈의 값은 서버 컴포넌트에서 클라이언트 참조로 바뀌어 읽을 수 없다).
 */
export const TASK_STATUS_LABEL = {
  todo: '할 일',
  in_progress: '진행 중',
  done: '완료',
  cancelled: '취소',
} as const;

export const PROJECT_STATUS_LABEL = {
  planned: '계획',
  active: '진행 중',
  on_hold: '보류',
  completed: '완료',
  archived: '보관',
} as const;

export const NOTE_TYPE_LABEL = { note: '노트', idea: '아이디어', resource: '자료' } as const;
