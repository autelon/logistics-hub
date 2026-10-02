import { datetime, varchar } from 'drizzle-orm/mysql-core';
import { v7 as uuidv7 } from 'uuid';

/** 시간순 정렬이 되는 UUIDv7. 서비스 경계를 넘어 참조되므로 앱에서 만든다. */
export const newId = (): string => uuidv7();

export const idColumn = () => varchar({ length: 36 });

/** 항상 UTC, 밀리초 정밀도. */
export const utcDateTime = () => datetime({ mode: 'date', fsp: 3 });
