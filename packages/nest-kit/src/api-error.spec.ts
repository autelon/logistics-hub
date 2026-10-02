import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { ApiError, defineErrors, toErrorResponse } from './api-error.js';

describe('defineErrors', () => {
  const error = defineErrors<'THING_NOT_FOUND' | 'THING_LOCKED'>({
    THING_NOT_FOUND: 404,
    THING_LOCKED: 409,
  });

  it('코드에 묶인 상태로 ApiError 를 만든다', () => {
    const e = error('THING_LOCKED', 'locked by someone', { by: 'a' });
    expect(e).toBeInstanceOf(ApiError);
    expect([e.status, e.code, e.message, e.details]).toEqual([
      409,
      'THING_LOCKED',
      'locked by someone',
      { by: 'a' },
    ]);
  });
});

describe('toErrorResponse', () => {
  it('ApiError: message 와 details 는 준 것만 싣는다', () => {
    expect(toErrorResponse(new ApiError(404, 'THING_NOT_FOUND'))).toEqual({
      status: 404,
      body: { code: 'THING_NOT_FOUND' },
      unexpected: false,
    });
    expect(toErrorResponse(new ApiError(409, 'THING_LOCKED', 'locked', [1]))).toEqual({
      status: 409,
      body: { code: 'THING_LOCKED', message: 'locked', details: [1] },
      unexpected: false,
    });
  });

  it('프레임워크의 4xx 예외에는 공통 코드를 붙인다', () => {
    expect(toErrorResponse(new NotFoundException('Cannot GET /nope')).body).toEqual({
      code: 'NOT_FOUND',
      message: 'Cannot GET /nope',
    });
    expect(toErrorResponse(new BadRequestException('Unexpected token')).body).toEqual({
      code: 'BAD_REQUEST',
      message: 'Unexpected token',
    });
  });

  it('예상하지 못한 예외는 내용을 숨기고 코드만 내보낸다', () => {
    for (const exception of [
      new Error('connect ECONNREFUSED 127.0.0.1:3306'),
      new InternalServerErrorException('secret detail'),
      'a thrown string',
    ]) {
      expect(toErrorResponse(exception)).toEqual({
        status: 500,
        body: { code: 'INTERNAL_ERROR' },
        unexpected: true,
      });
    }
  });
});
