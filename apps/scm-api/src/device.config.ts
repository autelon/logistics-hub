import { z } from 'zod';

import { defineConfig } from '@repo/nest-kit/config';

/** 기기 서버(기기 활성화 등을 처리하는 별도 API 서버)의 주소. */
export const deviceConfig = defineConfig(
  'device',
  z.object({ DEVICE_API_URL: z.url().default('http://localhost:3004') }),
  (env) => ({ apiUrl: env.DEVICE_API_URL }),
);
