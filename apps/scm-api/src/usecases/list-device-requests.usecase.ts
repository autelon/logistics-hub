import { Injectable } from '@nestjs/common';

import type { DeviceRequestView } from '@repo/contracts/scm';

import { DeviceRequestService } from '../domains/device-request/application/device-request.service.js';
import { toDeviceRequestView } from './device-request-view.js';

const RECENT = 50;

/** 운영 화면용: 최근 기기 요청 50건과 시리얼별 결과 집계. */
@Injectable()
export class ListDeviceRequestsUsecase {
  constructor(private readonly deviceRequests: DeviceRequestService) {}

  async execute(): Promise<DeviceRequestView[]> {
    const summaries = await this.deviceRequests.listRecent(RECENT);
    return summaries.map(toDeviceRequestView);
  }
}
