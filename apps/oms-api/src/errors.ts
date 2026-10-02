import type { OmsErrorCode } from '@repo/contracts/oms';
import { defineErrors } from '@repo/nest-kit/api-error';

/** 이 서비스가 내는 에러. 사용: `throw omsError('ORDER_NOT_FOUND', '보조 설명')` */
export const omsError = defineErrors<OmsErrorCode>({
  ORDER_NOT_FOUND: 404,
  UNKNOWN_SELLABLE: 422,
});
