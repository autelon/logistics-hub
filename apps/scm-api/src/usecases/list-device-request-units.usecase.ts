import { Injectable } from '@nestjs/common';

import type { DeviceRequestUnitsPage, DeviceRequestUnitsQuery } from '@repo/contracts/scm';

import { DeviceRequestService } from '../domains/device-request/application/device-request.service.js';

/** 기기 서버가 요청에 딸린 시리얼 목록을 페이지로 가져간다. 커서는 항목 id 이고 id 순서가 고정이다. */
@Injectable()
export class ListDeviceRequestUnitsUsecase {
  constructor(private readonly deviceRequests: DeviceRequestService) {}

  async execute(
    requestId: string,
    query: DeviceRequestUnitsQuery,
  ): Promise<DeviceRequestUnitsPage> {
    const { items, nextCursor } = await this.deviceRequests.unitsPage(
      requestId,
      query.cursor,
      query.limit,
    );
    return {
      items: items.map(({ serialNumber, sku }) => ({ serialNumber, sku })),
      nextCursor,
    };
  }
}
