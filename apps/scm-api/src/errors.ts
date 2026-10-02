import type { ScmErrorCode } from '@repo/contracts/scm';
import { defineErrors } from '@repo/nest-kit/api-error';

/** 이 서비스가 내는 에러. 사용: `throw scmError('UNIT_NOT_FOUND', '보조 설명')` */
export const scmError = defineErrors<ScmErrorCode>({
  UNIT_NOT_FOUND: 404,
  UNIT_EVENT_NOT_FOUND: 404,
  UNIT_EVENT_ALREADY_CORRECTED: 409,
  UNKNOWN_LOCATION: 422,
  UNKNOWN_SKU: 422,
  SKU_REQUIRED: 422,
  SERIAL_SKU_MISMATCH: 409,
});
