import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GatewayTimeoutException,
  GoneException,
  HttpException,
  ImATeapotException,
  InternalServerErrorException,
  MethodNotAllowedException,
  NotAcceptableException,
  NotFoundException,
  PayloadTooLargeException,
  RequestTimeoutException,
  ServiceUnavailableException,
  UnauthorizedException,
  UnprocessableEntityException,
  UnsupportedMediaTypeException,
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
  describe('ApiError', () => {
    it('message 와 details 는 준 것만 싣는다', () => {
      expect(toErrorResponse(new ApiError(404, 'THING_NOT_FOUND'))).toEqual({
        status: 404,
        body: { code: 'THING_NOT_FOUND' },
      });
      expect(toErrorResponse(new ApiError(409, 'THING_LOCKED', 'locked'))).toEqual({
        status: 409,
        body: { code: 'THING_LOCKED', message: 'locked' },
      });
      expect(toErrorResponse(new ApiError(409, 'THING_LOCKED', undefined, [1]))).toEqual({
        status: 409,
        body: { code: 'THING_LOCKED', details: [1] },
      });
      expect(toErrorResponse(new ApiError(409, 'THING_LOCKED', 'locked', [1]))).toEqual({
        status: 409,
        body: { code: 'THING_LOCKED', message: 'locked', details: [1] },
      });
    });

    it('서비스가 정한 5xx 코드는 그대로 내보낸다 (프레임워크 5xx 와 달리 의도된 응답)', () => {
      expect(toErrorResponse(new ApiError(503, 'WAREHOUSE_OFFLINE', 'retry later'))).toEqual({
        status: 503,
        body: { code: 'WAREHOUSE_OFFLINE', message: 'retry later' },
      });
    });
  });

  describe('프레임워크 HttpException', () => {
    it.each([
      [new BadRequestException('bad'), 400, 'BAD_REQUEST'],
      [new UnauthorizedException('who'), 401, 'UNAUTHORIZED'],
      [new ForbiddenException('no'), 403, 'FORBIDDEN'],
      [new NotFoundException('Cannot GET /nope'), 404, 'NOT_FOUND'],
      [new MethodNotAllowedException('m'), 405, 'METHOD_NOT_ALLOWED'],
      [new NotAcceptableException('n'), 406, 'NOT_ACCEPTABLE'],
      [new RequestTimeoutException('t'), 408, 'REQUEST_TIMEOUT'],
      [new ConflictException('c'), 409, 'CONFLICT'],
      [new PayloadTooLargeException('p'), 413, 'PAYLOAD_TOO_LARGE'],
      [new UnsupportedMediaTypeException('u'), 415, 'UNSUPPORTED_MEDIA_TYPE'],
      [new UnprocessableEntityException('e'), 422, 'UNPROCESSABLE_ENTITY'],
      [new HttpException('slow down', 429), 429, 'TOO_MANY_REQUESTS'],
    ])('%s → %i %s, 원래 상태를 유지하고 메시지를 전달한다', (exception, status, code) => {
      const reply = toErrorResponse(exception);
      expect(reply.status).toBe(status);
      expect(reply.body).toEqual({ code, message: exception.message });
    });

    it('표에 없는 4xx 는 상태를 유지하고 BAD_REQUEST 로 낸다', () => {
      expect(toErrorResponse(new GoneException('gone'))).toEqual({
        status: 410,
        body: { code: 'BAD_REQUEST', message: 'gone' },
      });
      expect(toErrorResponse(new ImATeapotException()).status).toBe(418);
    });

    it('인자 없이 던진 예외는 Nest 의 기본 문구를 message 로 낸다', () => {
      expect(toErrorResponse(new NotFoundException()).body).toEqual({
        code: 'NOT_FOUND',
        message: 'Not Found',
      });
    });

    it('객체 응답에서는 message 만 꺼내고 statusCode·error 는 버린다', () => {
      expect(
        toErrorResponse(new BadRequestException({ message: 'm', error: 'Bad', statusCode: 400 }))
          .body,
      ).toEqual({ code: 'BAD_REQUEST', message: 'm' });
      expect(toErrorResponse(new HttpException({ secret: 'x' }, 400)).body).toEqual({
        code: 'BAD_REQUEST',
      });
    });

    it('메시지 배열은 details 에 싣고 message 는 생략한다', () => {
      expect(
        toErrorResponse(new BadRequestException(['a is required', 'b too long'])).body,
      ).toEqual({
        code: 'BAD_REQUEST',
        details: ['a is required', 'b too long'],
      });
    });

    it('5xx 는 상태별 코드만 내보내고 메시지를 숨긴다', () => {
      expect(toErrorResponse(new ServiceUnavailableException('db down at 10.0.0.1'))).toEqual({
        status: 503,
        body: { code: 'SERVICE_UNAVAILABLE' },
      });
      expect(toErrorResponse(new GatewayTimeoutException('upstream'))).toEqual({
        status: 504,
        body: { code: 'GATEWAY_TIMEOUT' },
      });
      expect(toErrorResponse(new InternalServerErrorException('secret detail'))).toEqual({
        status: 500,
        body: { code: 'INTERNAL_ERROR' },
      });
      expect(toErrorResponse(new HttpException('x', 502))).toEqual({
        status: 502,
        body: { code: 'INTERNAL_ERROR' },
      });
    });

    it('HTTP 상태가 아닌 값이면 500 으로 다룬다', () => {
      expect(toErrorResponse(new HttpException('odd', 200))).toEqual({
        status: 500,
        body: { code: 'INTERNAL_ERROR' },
      });
    });
  });

  describe('http-errors 꼴의 에러 (Express 본문 파서)', () => {
    const httpError = (statusCode: number, message: string, expose: boolean) =>
      Object.assign(new Error(message), { statusCode, status: statusCode, expose });

    it('4xx 는 상태별 코드와 파서의 메시지를 낸다', () => {
      expect(toErrorResponse(httpError(413, 'request entity too large', true))).toEqual({
        status: 413,
        body: { code: 'PAYLOAD_TOO_LARGE', message: 'request entity too large' },
      });
      expect(toErrorResponse(httpError(415, 'unsupported charset "X"', true))).toEqual({
        status: 415,
        body: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'unsupported charset "X"' },
      });
    });

    it('5xx 는 메시지를 숨긴다', () => {
      expect(toErrorResponse(httpError(500, 'stream encoding should not be set', false))).toEqual({
        status: 500,
        body: { code: 'INTERNAL_ERROR' },
      });
    });
  });

  describe('알 수 없는 예외', () => {
    it.each([
      new Error('connect ECONNREFUSED 127.0.0.1:3306'),
      new TypeError('x is not a function'),
      'a thrown string',
      42,
      null,
      undefined,
      { statusCode: 404, message: 'looks like http-errors but is not' },
    ])('%o → 500 INTERNAL_ERROR, 내용 없음', (exception) => {
      expect(toErrorResponse(exception)).toEqual({
        status: 500,
        body: { code: 'INTERNAL_ERROR' },
      });
    });
  });
});
