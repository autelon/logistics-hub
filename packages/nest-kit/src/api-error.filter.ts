import { Catch, Logger, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';

import { toErrorResponse } from './api-error.js';

/** 모든 예외를 { code, message?, details? } 형태의 응답으로 내보낸다. InfraModule 이 전역으로 등록한다. */
@Catch()
export class ApiErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiErrorFilter.name);

  constructor(private readonly adapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const { status, body, unexpected } = toErrorResponse(exception);
    if (unexpected) {
      this.logger.error(
        exception instanceof Error ? (exception.stack ?? exception.message) : exception,
      );
    }
    this.adapterHost.httpAdapter.reply(host.switchToHttp().getResponse(), body, status);
  }
}
