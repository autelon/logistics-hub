import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';

import { DeviceRequestUnitsPage, type ReportDeviceResultsInput } from '@repo/contracts/scm';

import { mockDeviceConfig } from './mock-device.config.js';

/** 시리얼 목록을 한 번에 가져오는 최대 건수 (scm-api 의 한도는 1000). */
const PAGE_SIZE = 500;

/** scm-api(허브)의 기기 서버용 API 클라이언트. 2xx 가 아니면 던진다. */
@Injectable()
export class HubClient {
  constructor(
    @Inject(mockDeviceConfig.KEY) private readonly config: ConfigType<typeof mockDeviceConfig>,
  ) {}

  /** `GET /device-requests/:id/units` 한 페이지. */
  async units(requestId: string, cursor: string | undefined): Promise<DeviceRequestUnitsPage> {
    const url = new URL(
      `/device-requests/${encodeURIComponent(requestId)}/units`,
      this.config.hubUrl,
    );
    url.searchParams.set('limit', String(PAGE_SIZE));
    if (cursor) url.searchParams.set('cursor', cursor);

    const response = await fetch(url);
    if (!response.ok) throw new Error(`Hub answered ${response.status} for ${url.pathname}`);
    return DeviceRequestUnitsPage.parse(await response.json());
  }

  /** `POST /device-requests/:id/results`. */
  async report(requestId: string, body: ReportDeviceResultsInput): Promise<void> {
    const url = new URL(
      `/device-requests/${encodeURIComponent(requestId)}/results`,
      this.config.hubUrl,
    );
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`Hub answered ${response.status} for ${url.pathname}`);
  }
}
