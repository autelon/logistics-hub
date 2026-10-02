import type { AsErrorCode } from '@repo/contracts/as';
import { defineErrors } from '@repo/nest-kit/api-error';

/** 이 서비스가 내는 에러. 사용: `throw asError('CASE_NOT_FOUND', '보조 설명')` */
export const asError = defineErrors<AsErrorCode>({
  CASE_NOT_FOUND: 404,
  CASE_NOT_OPEN: 409,
  CASE_NOT_SCRAPPABLE: 409,
});
