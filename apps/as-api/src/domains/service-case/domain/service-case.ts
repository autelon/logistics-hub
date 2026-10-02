import type { DoaDisposition, DoaOrigin, ServiceCaseStatus } from '@repo/contracts/as';

/** DOA 접수 한 건. 실제 AS 시스템의 접수·수리 흐름 중 연동에 필요한 부분만 흉내 낸다. */
export interface ServiceCase {
  id: string;
  /** 사람이 읽는 접수 번호 (`CASE-2026-000045`). 내부 참조에는 쓰지 않는다. */
  publicId: string;
  serialNumber: string;
  origin: DoaOrigin;
  symptom: string;
  /** origin 이 AS_REPLACEMENT 일 때, 교체품을 내보낸 원래 케이스. */
  relatedCaseId: string | null;
  status: ServiceCaseStatus;
  disposition: DoaDisposition | null;
  openedAt: Date;
  confirmedAt: Date | null;
  scrappedAt: Date | null;
}

/** 접수할 때 담당자가 적는 내용. */
export type CaseIntake = Pick<ServiceCase, 'serialNumber' | 'origin' | 'symptom' | 'relatedCaseId'>;

/** 아직 저장되지 않은 접수. `id` 와 `publicId` 는 저장할 때 repository 가 발급한다. */
export type NewServiceCase = Omit<ServiceCase, 'id' | 'publicId'>;

export const openCase = (intake: CaseIntake, openedAt: Date): NewServiceCase => ({
  serialNumber: intake.serialNumber,
  origin: intake.origin,
  symptom: intake.symptom,
  relatedCaseId: intake.relatedCaseId,
  status: 'OPEN',
  disposition: null,
  openedAt,
  confirmedAt: null,
  scrappedAt: null,
});

/** OPEN → DOA_CONFIRMED. 이미 판정이 끝난 접수면 undefined. */
export const confirmDoa = (
  current: ServiceCase,
  disposition: DoaDisposition,
  at: Date,
): ServiceCase | undefined =>
  current.status === 'OPEN'
    ? { ...current, status: 'DOA_CONFIRMED', disposition, confirmedAt: at }
    : undefined;

/** OPEN → REJECTED. 이미 판정이 끝난 접수면 undefined. */
export const reject = (current: ServiceCase): ServiceCase | undefined =>
  current.status === 'OPEN' ? { ...current, status: 'REJECTED' } : undefined;

/** DOA_CONFIRMED(폐기 처분) → SCRAPPED. 폐기 처분으로 확정된 접수가 아니면 undefined. */
export const scrap = (current: ServiceCase, at: Date): ServiceCase | undefined =>
  current.status === 'DOA_CONFIRMED' && current.disposition === 'SCRAP'
    ? { ...current, status: 'SCRAPPED', scrappedAt: at }
    : undefined;
