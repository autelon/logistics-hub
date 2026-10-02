import { z } from 'zod';

import { defineEvent, IsoDateTime } from './common.js';

/** SALES: 판매 출고품의 초기 불량. AS_REPLACEMENT: AS 과정에서 내보낸 교체품의 초기 불량. */
export const DoaOrigin = z.enum(['SALES', 'AS_REPLACEMENT']);
export type DoaOrigin = z.infer<typeof DoaOrigin>;

export const DoaDisposition = z.enum(['SCRAP', 'RETURN_TO_VENDOR']);
export type DoaDisposition = z.infer<typeof DoaDisposition>;

export const ServiceCaseStatus = z.enum(['OPEN', 'DOA_CONFIRMED', 'REJECTED', 'SCRAPPED']);
export type ServiceCaseStatus = z.infer<typeof ServiceCaseStatus>;

// ---------- HTTP ----------

export const OpenCaseRequest = z.object({
  serialNumber: z.string().min(1).max(100),
  origin: DoaOrigin,
  symptom: z.string().min(1).max(500),
  /** AS_REPLACEMENT 인 경우, 교체품을 내보낸 원래 케이스. */
  relatedCaseId: z.string().min(1).nullable().default(null),
});
export type OpenCaseRequest = z.infer<typeof OpenCaseRequest>;

export const ConfirmDoaRequest = z.object({ disposition: DoaDisposition });
export type ConfirmDoaRequest = z.infer<typeof ConfirmDoaRequest>;

export interface ServiceCaseView {
  id: string;
  serialNumber: string;
  origin: DoaOrigin;
  symptom: string;
  relatedCaseId: string | null;
  status: ServiceCaseStatus;
  disposition: DoaDisposition | null;
  openedAt: string;
  confirmedAt: string | null;
  scrappedAt: string | null;
}

// ---------- 통합 이벤트 (topic: as.case-events) ----------

export const DoaConfirmed = defineEvent(
  'as.doa.confirmed',
  z.object({
    caseId: z.string(),
    serialNumber: z.string(),
    origin: DoaOrigin,
    disposition: DoaDisposition,
    confirmedAt: IsoDateTime,
  }),
);
export type DoaConfirmed = z.infer<typeof DoaConfirmed>;

export const UnitScrapped = defineEvent(
  'as.unit.scrapped',
  z.object({ caseId: z.string(), serialNumber: z.string(), scrappedAt: IsoDateTime }),
);
export type UnitScrapped = z.infer<typeof UnitScrapped>;

export const AsCaseMessage = z.discriminatedUnion('type', [DoaConfirmed, UnitScrapped]);
export type AsCaseMessage = z.infer<typeof AsCaseMessage>;
