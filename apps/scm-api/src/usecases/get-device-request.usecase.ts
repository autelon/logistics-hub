import { Injectable } from '@nestjs/common';

import type { DeviceRequestDetailView } from '@repo/contracts/scm';

import { DeviceRequestService } from '../domains/device-request/application/device-request.service.js';
import { toDeviceRequestView } from './device-request-view.js';

/** 운영 화면용: 기기 요청 하나의 요약과 실패한 시리얼(사유 포함). */
@Injectable()
export class GetDeviceRequestUsecase {
  constructor(private readonly deviceRequests: DeviceRequestService) {}

  async execute(requestId: string): Promise<DeviceRequestDetailView> {
    const { summary, failedItems } = await this.deviceRequests.get(requestId);
    return {
      ...toDeviceRequestView(summary),
      failedItems: failedItems.map((item) => ({
        serialNumber: item.serialNumber,
        sku: item.sku,
        reason: item.resultReason,
        resultAt: item.resultAt?.toISOString() ?? summary.request.createdAt.toISOString(),
      })),
    };
  }
}
