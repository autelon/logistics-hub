import type {
  DeviceRequestItemResult,
  DeviceRequestStatus,
  DeviceRequestType,
} from '@repo/contracts/scm';

/**
 * 기기 서버에 보내는 요청. 등록(REGISTER)과 비활성화(DEACTIVATE)는 기기 서버에서 서로 다른 처리라 요청을 따로 만든다.
 * 상태는 저장하지 않는다 (`computeDeviceRequestStatus`).
 */
export interface DeviceRequest {
  id: string;
  type: DeviceRequestType;
  /** 요청을 만든 사실의 종류(`DOA_CONFIRMED` 등) 또는 `REGISTRATION`, `REGISTRATION_VOIDED`. */
  reason: string;
  createdBy: string;
  createdAt: Date;
  /** 기기 서버에 알린 시각. 알림이 성공할 때까지 null. */
  notifiedAt: Date | null;
}

/** 요청에 딸린 개체. 시리얼과 SKU 는 요청 시점의 값을 복사한 것이다. */
export interface DeviceRequestItemDraft {
  unitId: string;
  serialNumber: string;
  sku: string;
}

export interface NewDeviceRequest {
  type: DeviceRequestType;
  reason: string;
  createdBy: string;
  items: readonly DeviceRequestItemDraft[];
}

export type ItemResultState = 'PENDING' | DeviceRequestItemResult;

export interface DeviceRequestItem extends DeviceRequestItemDraft {
  id: string;
  requestId: string;
  result: ItemResultState;
  resultReason: string | null;
  resultAt: Date | null;
}

/** 기기 서버가 보고한 시리얼 하나의 결과. */
export interface ItemResultReport {
  serialNumber: string;
  result: DeviceRequestItemResult;
  reason: string | null;
}

export interface DeviceRequestCounts {
  total: number;
  pending: number;
  succeeded: number;
  failed: number;
}

export interface DeviceRequestSummary {
  request: DeviceRequest;
  counts: DeviceRequestCounts;
  status: DeviceRequestStatus;
}
