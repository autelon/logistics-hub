import { z } from 'zod';

import { loadEnv } from '@repo/nest-kit/env';

export const env = loadEnv(
  z.object({
    PORT: z.coerce.number().default(3003),
    DATABASE_URL: z.string().default('mysql://root:root@localhost:3306/lh_as'),
    REDIS_URL: z.string().optional(),
  }),
);
