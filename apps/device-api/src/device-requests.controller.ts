import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';

import { DeviceRequestNotification } from '@repo/contracts/scm';
import { zod } from '@repo/nest-kit/zod.pipe';

import { DeviceRequestsService, type DeviceRequestState } from './device-requests.service.js';

/** 모의 기기 서버가 받는 API. 알림을 받고, 지금까지 받은 요청의 진행 상황을 보여 준다. */
@Controller('device-requests')
export class DeviceRequestsController {
  constructor(private readonly deviceRequests: DeviceRequestsService) {}

  /** 허브가 요청이 생겼음을 알린다. 시리얼은 오지 않고, 우리가 허브에서 가져간다. */
  @Post()
  @HttpCode(202)
  notify(@Body(zod(DeviceRequestNotification)) body: DeviceRequestNotification): {
    requestId: string;
    outcome: 'accepted' | 'duplicate';
  } {
    return { requestId: body.requestId, outcome: this.deviceRequests.accept(body) };
  }

  @Get()
  list(): DeviceRequestState[] {
    return this.deviceRequests.list();
  }
}
