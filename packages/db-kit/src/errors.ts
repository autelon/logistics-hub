/** MySQL 의 `ER_DUP_ENTRY`. 고유 인덱스(unique)를 어기는 INSERT/UPDATE 에서 난다. */
const ER_DUP_ENTRY = 1062;

/** MySQL 의 `ER_LOCK_DEADLOCK`. InnoDB 가 교착을 찾아 한쪽 트랜잭션을 롤백하며 "다시 시도하라"고 알린다. */
const ER_LOCK_DEADLOCK = 1213;

/** Drizzle 은 드라이버 에러를 `DrizzleQueryError` 로 감싸 `cause` 에 둔다. 순환에 빠지지 않도록 깊이를 제한한다. */
const MAX_CAUSE_DEPTH = 5;

/** 객체가 아니면 `undefined`. 값의 모양을 단정하지 않으려고 필드를 하나씩 읽는다. */
const field = (value: unknown, key: string): unknown =>
  typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined;

/** `cause` 사슬을 따라가며 MySQL 에러 번호(`errno`)나 코드(`code`)가 맞는 에러를 찾는다. */
const driverErrorOf = (error: unknown, errno: number, code: string): object | undefined => {
  let current = error;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth += 1) {
    if (typeof current !== 'object' || current === null) return undefined;
    if (field(current, 'errno') === errno || field(current, 'code') === code) return current;
    current = field(current, 'cause');
  }
  return undefined;
};

/** 메시지 끝의 `for key '<표.>인덱스'` 에서 인덱스 이름만 꺼낸다. 값 부분(`Duplicate entry '...'`)에 `'` 나 `.` 가 있어도 끝에서부터 읽는다. */
const constraintOf = (sqlMessage: unknown): string | undefined => {
  if (typeof sqlMessage !== 'string') return undefined;
  const key = /for key '([^']+)'\s*$/.exec(sqlMessage)?.[1];
  // MySQL 8.0.19 부터 `표.인덱스` 로 나온다. 그 전에는 인덱스 이름만 나온다. 인덱스 이름에는 `.` 가 없다.
  return key?.slice(key.lastIndexOf('.') + 1);
};

/**
 * 고유 인덱스를 어긴 에러(MySQL errno 1062)이면 어긴 인덱스 이름을, 아니면 `undefined`.
 * `cause` 사슬을 따라가므로 Drizzle 이 감싼 에러도 알아본다.
 * 외래 키 위반 같은 다른 에러는 `sqlState` 가 같아도(23000) 해당하지 않는다.
 */
export const duplicateKeyOf = (error: unknown): { constraint: string | undefined } | undefined => {
  const found = driverErrorOf(error, ER_DUP_ENTRY, 'ER_DUP_ENTRY');
  return found && { constraint: constraintOf(field(found, 'sqlMessage')) };
};

/**
 * 이 에러가 `constraint`(고유 인덱스 이름) 하나를 어긴 것인가. 다른 고유 인덱스를 어긴 것은 해당하지 않는다.
 * 인덱스 이름을 알 수 없으면(`undefined`) 아무것도 어긴 것으로 치지 않는다 — 모르는 것을 삼키지 않기 위해서다.
 * 스키마에서는 `column.uniqueName` 으로 이름을 얻는다 (`.unique()` 로 만든 열).
 */
export const isDuplicateKeyOn = (error: unknown, constraint: string | undefined): boolean => {
  if (constraint === undefined) return false;
  return duplicateKeyOf(error)?.constraint === constraint;
};

/**
 * InnoDB 가 교착을 찾아 이 트랜잭션을 희생시켰는가 (MySQL errno 1213).
 * 희생된 트랜잭션은 이미 롤백되어 있어서 처음부터 다시 하면 된다.
 */
export const isDeadlock = (error: unknown): boolean =>
  driverErrorOf(error, ER_LOCK_DEADLOCK, 'ER_LOCK_DEADLOCK') !== undefined;
