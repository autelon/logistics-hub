import type { z } from 'zod';

/** .env(있으면)를 읽고 스키마로 검증한다. 잘못된 설정이면 기동 시점에 바로 실패한다. */
export const loadEnv = <T extends z.ZodType>(schema: T): z.infer<T> => {
  try {
    process.loadEnvFile();
  } catch {
    // .env 가 없으면 프로세스 환경변수만 쓴다.
  }
  return schema.parse(process.env);
};
