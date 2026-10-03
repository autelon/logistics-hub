import { Injectable } from '@nestjs/common';

import type { DeviceRequestCreated } from '@repo/contracts/scm';

import {
  DeviceRequestService,
  type NotifyResult,
} from '../domains/device-request/application/device-request.service.js';

/**
 * 기기 요청이 만들어졌다는 이벤트를 받아 기기 서버에 알린다.
 * 외부 HTTP 호출이라 일부러 DB 트랜잭션으로 감싸지 않는다 (호출이 끝나는 동안 연결·잠금을 쥐지 않기 위해).
 * 멱등성은 `notified_at` 으로 보장한다. 알림이 실패하면 던진다 → 메시지가 확인 처리되지 않아 다시 시도된다.
 */
@Injectable()
export class NotifyDeviceRequestUsecase {
  constructor(private readonly deviceRequests: DeviceRequestService) {}

  execute(event: DeviceRequestCreated): Promise<NotifyResult> {
    return this.deviceRequests.notify(event.payload);
  }
}
