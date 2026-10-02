import { HttpException } from '@nestjs/common';

import type { ErrorResponse } from '@repo/contracts/common';

/** 에러 코드를 가진 예외. 서비스 코드는 이것만 던진다 (각 앱의 errors.ts 를 통해). */
export class ApiError<TCode extends string = string> extends Error {
  constructor(
    readonly status: number,
    readonly code: TCode,
    message?: string,
    readonly details?: unknown,
  ) {
    super(message ?? code);
    this.name = 'ApiError';
    this.hasMessage = message !== undefined;
  }

  /** message 를 주지 않았으면 응답에도 싣지 않는다. */
  readonly hasMessage: boolean;
}

/**
 * 서비스의 에러 코드와 HTTP 상태를 한 표로 묶는다.
 * 코드 타입의 모든 값에 상태가 있어야 컴파일되므로, 코드를 추가하고 상태를 빠뜨릴 수 없다.
 */
export const defineErrors =
  <TCode extends string>(statusByCode: Record<TCode, number>) =>
  (code: TCode, message?: string, details?: unknown) =>
    new ApiError(statusByCode[code], code, message, details);

/** 어떤 예외든 "상태 + 코드가 있는 본문"으로 바꾼다. 코드 없는 에러 응답은 나가지 않는다. */
export const toErrorResponse = (
  exception: unknown,
): { status: number; body: ErrorResponse; unexpected: boolean } => {
  if (exception instanceof ApiError) {
    return {
      status: exception.status,
      body: {
        code: exception.code,
        ...(exception.hasMessage && { message: exception.message }),
        ...(exception.details !== undefined && { details: exception.details }),
      },
      unexpected: false,
    };
  }

  // 프레임워크가 던지는 예외 (없는 경로, 깨진 JSON 본문 등).
  if (exception instanceof HttpException && exception.getStatus() < 500) {
    const status = exception.getStatus();
    return {
      status,
      body: { code: status === 404 ? 'NOT_FOUND' : 'BAD_REQUEST', message: exception.message },
      unexpected: false,
    };
  }

  // 예상하지 못한 예외. 내부 사정이 새지 않게 코드만 내보낸다.
  return { status: 500, body: { code: 'INTERNAL_ERROR' }, unexpected: true };
};
