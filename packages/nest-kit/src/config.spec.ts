import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  ConfigError,
  databaseConfig,
  defineConfig,
  httpConfig,
  logConfig,
  messagingConfig,
  sharedConfigsOf,
  validateEnv,
} from './config.js';

const defaults = { PORT: 3001, DATABASE_URL: 'mysql://root:root@localhost:3306/lh_scm' };
const validate = validateEnv([httpConfig, databaseConfig, messagingConfig, logConfig], defaults);

const problemsOf = (run: () => unknown): string[] => {
  try {
    run();
  } catch (error) {
    if (error instanceof ConfigError) return error.problems;
    throw error;
  }
  return [];
};

describe('validateEnv', () => {
  it('환경에 없는 값은 서비스 기본값으로 채운다', () => {
    expect(validate({})).toEqual({ PORT: '3001', DATABASE_URL: defaults.DATABASE_URL });
  });

  it('환경에 있는 값이 기본값을 이긴다', () => {
    expect(validate({ PORT: '4000', OTHER: 'kept' })).toEqual({
      PORT: '4000',
      DATABASE_URL: defaults.DATABASE_URL,
      OTHER: 'kept',
    });
  });

  it('잘못된 변수를 네임스페이스를 가리지 않고 전부 모아서 알린다', () => {
    const problems = problemsOf(() =>
      validate({ PORT: 'abc', DATABASE_URL: 'postgres://x', REDIS_URL: 'nope', LOG_LEVEL: 'loud' }),
    );
    expect(problems.map((problem) => problem.split(':')[0])).toEqual([
      'PORT',
      'DATABASE_URL',
      'REDIS_URL',
      'LOG_LEVEL',
    ]);
  });

  it('오류 메시지에 값을 싣지 않는다', () => {
    const error = (() => {
      try {
        validate({ DATABASE_URL: 'postgres://user:secret@host/db' });
      } catch (caught) {
        return caught;
      }
      return undefined;
    })();
    expect(error).toBeInstanceOf(ConfigError);
    expect(String(error)).not.toContain('secret');
  });

  it('빈 PORT 는 기본값으로 넘어가지 않고 오류다', () => {
    expect(problemsOf(() => validate({ PORT: '' }))).toHaveLength(1);
  });

  it('빈 REDIS_URL 은 없는 것으로 본다', () => {
    expect(problemsOf(() => validate({ REDIS_URL: '' }))).toEqual([]);
  });
});

describe('DB 없는 서비스', () => {
  const noDb = { PORT: 3004 };

  it('DATABASE_URL 기본값이 없으면 http 와 log 만 공용으로 읽는다', () => {
    expect(sharedConfigsOf(noDb)).toEqual([httpConfig, logConfig]);
    expect(sharedConfigsOf(defaults)).toEqual([
      httpConfig,
      databaseConfig,
      messagingConfig,
      logConfig,
    ]);
  });

  it('DATABASE_URL 이 없어도 검증을 통과하고 기본 PORT 만 채운다', () => {
    const validateNoDb = validateEnv(sharedConfigsOf(noDb), noDb);
    expect(validateNoDb({})).toEqual({ PORT: '3004' });
    expect(problemsOf(() => validateNoDb({ PORT: 'abc', LOG_LEVEL: 'loud' }))).toHaveLength(2);
  });
});

describe('defineConfig', () => {
  const sample = defineConfig(
    'sample',
    z.object({
      SAMPLE_NEST_KIT_TEST_URL: z.url(),
      SAMPLE_NEST_KIT_TEST_RETRIES: z.coerce.number().default(3),
    }),
    (env) => ({ url: env.SAMPLE_NEST_KIT_TEST_URL, retries: env.SAMPLE_NEST_KIT_TEST_RETRIES }),
  );

  it('네임스페이스마다 주입 토큰(KEY)이 생긴다', () => {
    expect(sample.KEY).toBe('CONFIGURATION(sample)');
    expect(httpConfig.KEY).not.toBe(databaseConfig.KEY);
  });

  it('process.env 를 검증해 코드가 쓰는 모양으로 돌려준다', () => {
    process.env['SAMPLE_NEST_KIT_TEST_URL'] = 'https://example.com';
    try {
      expect(sample()).toEqual({ url: 'https://example.com', retries: 3 });
    } finally {
      delete process.env['SAMPLE_NEST_KIT_TEST_URL'];
    }
  });

  it('검증에 실패하면 ConfigError 를 던진다', () => {
    expect(problemsOf(() => sample())).toHaveLength(1);
  });
});
