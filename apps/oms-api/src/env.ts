import { z } from 'zod';

import { loadEnv } from '@repo/nest-kit/env';

export const env = loadEnv(
  z.object({
    PORT: z.coerce.number().default(3002),
    DATABASE_URL: z.string().default('mysql://root:root@localhost:3306/lh_oms'),
    REDIS_URL: z.string().optional(),
  }),
);
