import { describe, expect, it } from 'vitest';

import { duplicateKeyOf, isDeadlock, isDuplicateKeyOn } from './errors.js';

/** mysql2 가 던지는 모양 (MySQL 9.7.2 에서 실제로 본 값). */
const driverError = (sqlMessage: string, overrides: Record<string, unknown> = {}) =>
  Object.assign(new Error(sqlMessage), {
    code: 'ER_DUP_ENTRY',
    errno: 1062,
    sqlState: '23000',
    sqlMessage,
    ...overrides,
  });

/** Drizzle 은 쿼리 실패를 감싸서 드라이버 에러를 `cause` 에 둔다. */
const wrapped = (cause: unknown) => Object.assign(new Error('Failed query: insert ...'), { cause });

const DUPLICATE = "Duplicate entry 'k1' for key 'unit_events.unit_events_idempotencyKey_unique'";

describe('duplicateKeyOf', () => {
  it('Drizzle 이 감싼 ER_DUP_ENTRY 에서 어긴 인덱스 이름을 꺼낸다', () => {
    expect(duplicateKeyOf(wrapped(driverError(DUPLICATE)))).toEqual({
      constraint: 'unit_events_idempotencyKey_unique',
    });
  });

  it('감싸지 않은 드라이버 에러도 알아본다', () => {
    expect(duplicateKeyOf(driverError(DUPLICATE))?.constraint).toBe(
      'unit_events_idempotencyKey_unique',
    );
  });

  it('표 이름 없이 인덱스만 나오는 옛 메시지 형식도 읽는다', () => {
    const message = "Duplicate entry 'k1' for key 'unit_events_idempotencyKey_unique'";
    expect(duplicateKeyOf(driverError(message))?.constraint).toBe(
      'unit_events_idempotencyKey_unique',
    );
  });

  it('값에 작은따옴표와 점이 들어 있어도 끝의 인덱스 이름을 읽는다', () => {
    const message = "Duplicate entry 'it's.a for key 'x' for key 'units.units_serialNumber_unique'";
    expect(duplicateKeyOf(driverError(message))?.constraint).toBe('units_serialNumber_unique');
  });

  it('errno 가 없어도 code 가 ER_DUP_ENTRY 면 고유 키 위반이다', () => {
    expect(duplicateKeyOf(driverError(DUPLICATE, { errno: undefined }))).toBeDefined();
  });

  it('인덱스 이름을 읽지 못하면 이름 없이 고유 키 위반임만 알린다', () => {
    expect(duplicateKeyOf(driverError('Duplicate entry'))).toEqual({ constraint: undefined });
  });

  it('외래 키 위반처럼 sqlState 가 같은 다른 에러는 해당하지 않는다', () => {
    const foreignKey = driverError('Cannot add or update a child row', {
      code: 'ER_NO_REFERENCED_ROW_2',
      errno: 1452,
    });
    expect(duplicateKeyOf(wrapped(foreignKey))).toBeUndefined();
  });

  it('에러가 아닌 값과 cause 가 없는 에러는 해당하지 않는다', () => {
    expect(duplicateKeyOf(undefined)).toBeUndefined();
    expect(duplicateKeyOf('ER_DUP_ENTRY')).toBeUndefined();
    expect(duplicateKeyOf(new Error('boom'))).toBeUndefined();
  });

  it('cause 가 순환해도 멈춘다', () => {
    const loop: Error & { cause?: unknown } = new Error('loop');
    loop.cause = loop;
    expect(duplicateKeyOf(loop)).toBeUndefined();
  });
});

describe('isDeadlock', () => {
  const deadlock = driverError(
    'Deadlock found when trying to get lock; try restarting transaction',
    {
      code: 'ER_LOCK_DEADLOCK',
      errno: 1213,
      sqlState: '40001',
    },
  );

  it('Drizzle 이 감싼 교착도 알아본다', () => {
    expect(isDeadlock(wrapped(deadlock))).toBe(true);
    expect(isDeadlock(deadlock)).toBe(true);
  });

  it('고유 키 위반이나 다른 에러는 교착이 아니다', () => {
    expect(isDeadlock(wrapped(driverError(DUPLICATE)))).toBe(false);
    expect(isDeadlock(new Error('boom'))).toBe(false);
    expect(isDeadlock(undefined)).toBe(false);
  });

  it('교착은 고유 키 위반이 아니다', () => {
    expect(duplicateKeyOf(wrapped(deadlock))).toBeUndefined();
  });
});

describe('isDuplicateKeyOn', () => {
  const error = wrapped(driverError(DUPLICATE));

  it('같은 인덱스를 어겼을 때만 참이다', () => {
    expect(isDuplicateKeyOn(error, 'unit_events_idempotencyKey_unique')).toBe(true);
  });

  it('다른 고유 인덱스를 어긴 것은 거짓이다', () => {
    expect(isDuplicateKeyOn(error, 'units_serialNumber_unique')).toBe(false);
    expect(isDuplicateKeyOn(error, 'stock_movements_idempotencyKey_unique')).toBe(false);
  });

  it('비교할 이름이 없으면 거짓이다 (모르는 중복 키를 삼키지 않는다)', () => {
    expect(isDuplicateKeyOn(error, undefined)).toBe(false);
    expect(isDuplicateKeyOn(wrapped(driverError('Duplicate entry')), undefined)).toBe(false);
  });
});
