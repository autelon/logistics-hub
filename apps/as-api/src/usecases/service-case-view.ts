import type { ServiceCaseView } from '@repo/contracts/as';

import type { ServiceCase } from '../domains/service-case/domain/service-case.js';

/** 도메인 타입 → 응답 규격. 모든 usecase 가 접수를 같은 모양으로 돌려준다. */
export const toServiceCaseView = (serviceCase: ServiceCase): ServiceCaseView => ({
  id: serviceCase.id,
  publicId: serviceCase.publicId,
  serialNumber: serviceCase.serialNumber,
  origin: serviceCase.origin,
  symptom: serviceCase.symptom,
  relatedCaseId: serviceCase.relatedCaseId,
  status: serviceCase.status,
  disposition: serviceCase.disposition,
  openedAt: serviceCase.openedAt.toISOString(),
  confirmedAt: serviceCase.confirmedAt?.toISOString() ?? null,
  scrappedAt: serviceCase.scrappedAt?.toISOString() ?? null,
});
