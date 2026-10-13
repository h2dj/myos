export class DomainError extends Error {
  constructor(
    message: string,
    readonly code: 'NOT_FOUND' | 'FORBIDDEN' | 'VALIDATION',
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** 존재하지 않거나, 접근 권한이 없어 존재를 드러내지 않아야 하는 경우 */
export class NotFoundError extends DomainError {
  constructor(what = '항목') {
    super(`${what}을(를) 찾을 수 없습니다.`, 'NOT_FOUND');
  }
}

export class ForbiddenError extends DomainError {
  constructor(message = '이 작업을 할 권한이 없습니다.') {
    super(message, 'FORBIDDEN');
  }
}

export class ValidationError extends DomainError {
  constructor(message: string) {
    super(message, 'VALIDATION');
  }
}
