import { z } from 'zod';

import { defineConfig } from '@repo/nest-kit/config';

export const mockDeviceConfig = defineConfig(
  'mockDevice',
  z.object({
    /** 시리얼 목록을 당겨 가고 결과를 돌려줄 scm-api. */
    HUB_URL: z.url().default('http://localhost:3001'),
    /** 이 접미사로 끝나는 시리얼은 FAILED 로 보고한다. 비워 두면 전부 성공이다. */
    FAIL_SERIAL_SUFFIX: z
      .string()
      .optional()
      .transform((value) => (value ? value : undefined)),
  }),
  (env) => ({ hubUrl: env.HUB_URL, failSerialSuffix: env.FAIL_SERIAL_SUFFIX }),
);
