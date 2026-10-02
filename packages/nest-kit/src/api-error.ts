import { HttpException } from '@nestjs/common';

import type { CommonErrorCode, ErrorResponse } from '@repo/contracts/common';

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

/** 프레임워크 예외의 HTTP 상태를 공통 코드로. 표에 없는 4xx 는 BAD_REQUEST, 5xx 는 INTERNAL_ERROR. */
const CODE_BY_STATUS: Readonly<Partial<Record<number, CommonErrorCode>>> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  406: 'NOT_ACCEPTABLE',
  408: 'REQUEST_TIMEOUT',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  422: 'UNPROCESSABLE_ENTITY',
  429: 'TOO_MANY_REQUESTS',
  503: 'SERVICE_UNAVAILABLE',
  504: 'GATEWAY_TIMEOUT',
};

export interface ErrorReply {
  status: number;
  body: ErrorResponse;
}

const INTERNAL_ERROR: ErrorReply = { status: 500, body: { code: 'INTERNAL_ERROR' } };

/**
 * 상태 코드와 (4xx 일 때만 쓰는) 메시지로 응답을 만든다.
 * 메시지가 문자열이면 message 에, 문자열 배열이면 details 에 싣는다. 5xx 는 코드만 내보낸다.
 */
const fromStatus = (status: number, message: unknown): ErrorReply => {
  if (!Number.isInteger(status) || status < 400 || status > 599) return INTERNAL_ERROR;
  const code = CODE_BY_STATUS[status] ?? (status >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST');
  if (status >= 500) return { status, body: { code } };
  if (typeof message === 'string' && message !== '') return { status, body: { code, message } };
  if (Array.isArray(message) && message.length > 0)
    return { status, body: { code, details: message } };
  return { status, body: { code } };
};

/** HttpException.getResponse() 는 문자열이거나 { message, error, statusCode } 꼴의 객체다. message 만 꺼낸다. */
const messageOf = (exception: HttpException): unknown => {
  const response: unknown = exception.getResponse();
  if (typeof response === 'string') return response;
  if (typeof response === 'object' && response !== null && 'message' in response) {
    return response.message;
  }
  return undefined;
};

/** `http-errors` 패키지의 에러 (Express 본문 파서가 413, 415 등에 던진다). Nest 는 이것을 HttpException 으로 바꾸지 않는다. */
const isHttpError = (
  value: unknown,
): value is Error & { statusCode: number; status: number; expose: boolean } =>
  value instanceof Error &&
  'expose' in value &&
  typeof value.expose === 'boolean' &&
  'statusCode' in value &&
  typeof value.statusCode === 'number' &&
  'status' in value &&
  value.status === value.statusCode;

/**
 * 어떤 예외든 "상태 + 코드가 있는 본문"으로 바꾼다. 코드 없는 에러 응답은 나가지 않는다.
 * 5xx 와 알 수 없는 예외는 내용을 숨기고 코드만 내보낸다. 원인 기록은 필터의 몫이다.
 */
export const toErrorResponse = (exception: unknown): ErrorReply => {
  if (exception instanceof ApiError) {
    return {
      status: exception.status,
      body: {
        code: exception.code,
        ...(exception.hasMessage && { message: exception.message }),
        ...(exception.details !== undefined && { details: exception.details }),
      },
    };
  }
  if (exception instanceof HttpException) {
    return fromStatus(exception.getStatus(), messageOf(exception));
  }
  if (isHttpError(exception)) {
    // expose 는 4xx 에서만 true 다. 메시지는 "request entity too large" 같은 파서의 설명이다.
    return fromStatus(exception.statusCode, exception.expose ? exception.message : undefined);
  }
  return INTERNAL_ERROR;
};
