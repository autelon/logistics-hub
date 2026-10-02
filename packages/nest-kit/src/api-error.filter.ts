import type { IncomingMessage, ServerResponse } from 'node:http';
import { Catch, Logger, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';

import { requestIdOf } from './access-log.js';
import { toErrorResponse } from './api-error.js';

/** 로그에 남길 스택. Error 가 아닌 값이 던져졌으면 그 값을 문자열로. */
const stackOf = (exception: unknown): string =>
  exception instanceof Error
    ? (exception.stack ?? `${exception.name}: ${exception.message}`)
    : String(exception);

/**
 * 모든 예외를 { code, message?, details? } 형태의 응답으로 내보낸다. InfraModule 이 전역으로 등록한다.
 *
 * 로그 정책: 5xx 는 error 로 원인(스택)과 요청 ID·method·path 를 남긴다.
 * 4xx 는 debug 로만 남긴다. 요청 로그(accessLog)가 이미 상태 코드와 요청 ID 를 한 줄 남기고,
 * 클라이언트의 잘못은 서버가 조치할 일이 아니라 warn 이면 소음이 된다.
 * 원인을 쫓을 때 LOG_LEVEL=debug 로 올리면 코드와 메시지까지 보인다.
 */
@Catch()
export class ApiErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiErrorFilter.name);

  constructor(private readonly adapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost) {
    if (host.getType() !== 'http') {
      // 전역 필터라 HTTP 가 아닌 컨텍스트에도 불린다. 응답을 만들 수 없으니 기록만 하고 넘긴다.
      this.logger.error(`unhandled exception in ${host.getType()} context`, stackOf(exception));
      throw exception;
    }

    const { httpAdapter } = this.adapterHost;
    const http = host.switchToHttp();
    const request = http.getRequest<IncomingMessage>();
    const response = http.getResponse<ServerResponse>();
    const { status, body } = toErrorResponse(exception);

    const context = {
      requestId: requestIdOf(response),
      method: request.method ?? '',
      path: (request.url ?? '').split('?')[0] ?? '',
      status,
      code: body.code,
    };
    const summary = `${context.method} ${context.path} -> ${status} ${body.code}`;
    if (status >= 500) {
      this.logger.error(summary, context, stackOf(exception));
    } else {
      this.logger.debug(`${summary}${body.message ? `: ${body.message}` : ''}`, context);
    }

    if (httpAdapter.isHeadersSent(response)) {
      // 이미 응답이 나가기 시작했으면 다시 쓸 수 없다. 끊어서 클라이언트가 불완전한 응답임을 알게 한다.
      httpAdapter.end(response);
      return;
    }
    httpAdapter.reply(response, body, status);
  }
}
