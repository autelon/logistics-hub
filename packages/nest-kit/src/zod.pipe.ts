import type { PipeTransform } from '@nestjs/common';
import type { z } from 'zod';

import { ApiError } from './api-error.js';

/** `@Body(zod(Schema)) body: Schema` 형태로 쓴다. 통과한 값의 타입은 스키마가 보장한다. */
export const zod = <T extends z.ZodType>(schema: T): PipeTransform<unknown, z.infer<T>> => {
  return {
    transform(value) {
      const result = schema.safeParse(value);
      if (!result.success) {
        throw new ApiError(
          400,
          'VALIDATION_FAILED',
          undefined,
          result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        );
      }
      return result.data;
    },
  };
};
