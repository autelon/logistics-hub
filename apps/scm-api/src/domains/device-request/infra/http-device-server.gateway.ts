import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';

import type { DeviceRequestNotification } from '@repo/contracts/scm';

import { deviceConfig } from '../../../device.config.js';
import type { DeviceServerGateway } from '../domain/device-server.gateway.js';

/** 기기 서버가 응답하지 않을 때 소비자를 오래 붙잡지 않는다. 시간 초과도 실패라 다시 시도된다. */
const TIMEOUT_MS = 5000;

/** `POST <DEVICE_API_URL>/device-requests { requestId, type, count }`. 2xx 가 아니거나 연결에 실패하면 던진다. */
@Injectable()
export class HttpDeviceServerGateway implements DeviceServerGateway {
  constructor(@Inject(deviceConfig.KEY) private readonly device: ConfigType<typeof deviceConfig>) {}

  async notify(notification: DeviceRequestNotification): Promise<void> {
    const url = new URL('/device-requests', this.device.apiUrl);
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(notification),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(
        `Device server answered ${response.status} for request ${notification.requestId}`,
      );
    }
  }
}
