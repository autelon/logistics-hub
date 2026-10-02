import { ConfigModule, registerAs } from '@nestjs/config';
import { z } from 'zod';

/** 환경변수 설정이 잘못됐을 때 던진다. 잘못된 변수를 전부 한 번에 알려 준다. */
export class ConfigError extends Error {
  declare readonly problems: string[];

  constructor(problems: string[]) {
    super(
      [
        'Invalid environment configuration (check process env and .env):',
        ...problems.map((problem) => `  - ${problem}`),
      ].join('\n'),
    );
    this.name = 'ConfigError';
    // 기동 로그에 메시지만 남게 한다. 호출 스택은 원인을 찾는 데 쓸모가 없고, 열거되는 프로퍼티는 한 번 더 찍힌다.
    this.stack = `${this.name}: ${this.message}`;
    Object.defineProperty(this, 'problems', { value: problems, enumerable: false });
  }
}

const problemsOf = (schema: z.ZodType, env: unknown): string[] => {
  const result = schema.safeParse(env);
  if (result.success) return [];
  // 값은 싣지 않는다. 접속 문자열 같은 비밀이 로그에 남기 때문이다.
  return result.error.issues.map((issue) => `${issue.path.join('.') || '(env)'}: ${issue.message}`);
};

/**
 * 타입이 있는 설정 네임스페이스를 만든다 (`registerAs` + zod 검증).
 * 쓰는 쪽: `@Inject(xConfig.KEY) private readonly x: ConfigType<typeof xConfig>`
 *
 * @param envSchema 이 네임스페이스가 읽는 환경변수의 스키마. 기본값도 여기 둔다
 * @param toConfig 검증된 환경변수를 코드가 쓰는 모양으로 바꾼다
 */
export const defineConfig = <S extends z.ZodType, T extends Record<string, unknown>>(
  namespace: string,
  envSchema: S,
  toConfig: (env: z.infer<S>) => T,
) => {
  const factory = registerAs(namespace, (): T => {
    const result = envSchema.safeParse(process.env);
    if (!result.success) throw new ConfigError(problemsOf(envSchema, process.env));
    return toConfig(result.data);
  });
  return Object.assign(factory, { envSchema });
};

/** `defineConfig` 가 만든 설정 네임스페이스. */
export type DefinedConfig = (() => Record<string, unknown>) & {
  KEY: string | symbol;
  envSchema: z.ZodType;
};

/** 낮은 것부터. Nest 의 LogLevel 과 같다. */
export const LOG_LEVELS = ['verbose', 'debug', 'log', 'warn', 'error', 'fatal'] as const;

export const httpConfig = defineConfig(
  'http',
  z.object({ PORT: z.coerce.number().int().min(1).max(65535) }),
  (env) => ({ port: env.PORT }),
);

export const databaseConfig = defineConfig(
  'database',
  z.object({ DATABASE_URL: z.url({ protocol: /^mysql$/ }) }),
  (env) => ({ url: env.DATABASE_URL }),
);

export const messagingConfig = defineConfig(
  'messaging',
  z.object({
    // 비워 두면(REDIS_URL=) 없는 것으로 본다.
    REDIS_URL: z
      .union([z.literal('').transform(() => undefined), z.url({ protocol: /^rediss?$/ })])
      .optional(),
  }),
  /** redisUrl 이 없으면 프로세스 내부 버스를 쓴다 (다른 서비스로는 전달되지 않음). */
  (env) => ({ redisUrl: env.REDIS_URL }),
);

export const logConfig = defineConfig(
  'log',
  z.object({
    LOG_LEVEL: z.enum(LOG_LEVELS).default('log'),
    LOG_FORMAT: z.enum(['text', 'json']).default('text'),
  }),
  (env) => ({ level: env.LOG_LEVEL, format: env.LOG_FORMAT }),
);

const sharedConfigs: DefinedConfig[] = [httpConfig, databaseConfig, messagingConfig, logConfig];

/** 서비스마다 다른 기본값. 환경변수에도 .env 에도 없을 때만 쓰인다. */
export interface ServiceDefaults {
  PORT: number;
  DATABASE_URL: string;
}

/**
 * 기본값을 채우고 모든 네임스페이스의 스키마로 한 번에 검증한다 (`ConfigModule.forRoot` 의 `validate` 훅).
 * 돌려준 값 중 process.env 에 없던 키는 ConfigModule 이 process.env 에 채워 넣으므로,
 * 뒤에 실행되는 각 네임스페이스 팩토리가 같은 값을 본다.
 */
export const validateEnv =
  (configs: DefinedConfig[], defaults: ServiceDefaults) =>
  (env: Record<string, unknown>): Record<string, unknown> => {
    const merged = { PORT: String(defaults.PORT), DATABASE_URL: defaults.DATABASE_URL, ...env };
    const problems = configs.flatMap((config) => problemsOf(config.envSchema, merged));
    if (problems.length > 0) throw new ConfigError(problems);
    return merged;
  };

/**
 * 서비스의 설정 모듈. AppModule 의 imports 에 한 번 넣는다.
 * 공용 네임스페이스(http, database, messaging, log)를 전역으로 등록하고, `load` 로 서비스 고유 네임스페이스를 더한다.
 *
 * 우선순위: 프로세스 환경변수 > 실행 디렉터리의 `.env` > `defaults` > 스키마의 기본값.
 */
export const serviceConfigModule = (options: {
  defaults: ServiceDefaults;
  load?: DefinedConfig[];
}) => {
  const configs = [...sharedConfigs, ...(options.load ?? [])];
  const module = ConfigModule.forRoot({
    isGlobal: true,
    load: configs,
    validate: validateEnv(configs, options.defaults),
  });
  return module;
};
