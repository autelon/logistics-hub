import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Logger } from '@nestjs/common';

export const REQUEST_ID_HEADER = 'x-request-id';

/** 로그와 응답 헤더에 그대로 실어도 안전한 짧은 토큰만 받는다. */
const SAFE_REQUEST_ID = /^[\w.-]{1,64}$/;

/** 클라이언트가 보낸 요청 ID 가 쓸 만하면 그대로, 아니면 새로 만든다. */
export const resolveRequestId = (incoming: unknown): string =>
  typeof incoming === 'string' && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();

/** accessLog 미들웨어가 정해 둔 요청 ID. 미들웨어를 거치지 않은 요청이면 undefined. */
export const requestIdOf = (response: ServerResponse): string | undefined => {
  const value = response.getHeader(REQUEST_ID_HEADER);
  return typeof value === 'string' ? value : undefined;
};

const logger = new Logger('Http');

/**
 * 요청 ID 를 정해 `x-request-id` 응답 헤더에 싣고, 응답이 끝나면 요청 한 건당 한 줄을 남긴다.
 * main.ts 에서 `app.use(accessLog)` 로 건다. 본문 파서보다 앞에 놓여야
 * 파싱 단계에서 실패한 요청(깨진 JSON, 너무 큰 본문)에도 요청 ID 와 로그가 남는다.
 */
export const accessLog = (
  request: IncomingMessage,
  response: ServerResponse,
  next: () => void,
): void => {
  const requestId = resolveRequestId(request.headers[REQUEST_ID_HEADER]);
  response.setHeader(REQUEST_ID_HEADER, requestId);

  const method = request.method ?? '';
  // 쿼리 문자열은 남기지 않는다 (개인정보·토큰이 들어올 수 있다).
  const path = (request.url ?? '').split('?')[0] ?? '';
  if (path === '/health') {
    next();
    return;
  }

  const startedAt = performance.now();
  response.once('close', () => {
    const durationMs = Math.round(performance.now() - startedAt);
    // 응답을 다 쓰기 전에 연결이 끊기면 status 는 보내려던 값(기본 200)이라 따로 표시한다.
    const aborted = !response.writableFinished;
    logger.log(
      `${method} ${path} ${response.statusCode} ${durationMs}ms${aborted ? ' (aborted)' : ''}`,
      {
        requestId,
        method,
        path,
        status: response.statusCode,
        durationMs,
        ...(aborted && { aborted }),
      },
    );
  });
  next();
};
