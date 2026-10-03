import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';

import { ApiErrorFilter } from '@repo/nest-kit/api-error.filter';
import { serviceConfigModule } from '@repo/nest-kit/config';
import { HealthController } from '@repo/nest-kit/health.controller';
import { LoggerModule } from '@repo/nest-kit/logger.module';

import { DeviceRequestsController } from './device-requests.controller.js';
import { DeviceRequestsService } from './device-requests.service.js';
import { HubClient } from './hub.client.js';
import { mockDeviceConfig } from './mock-device.config.js';

/**
 * 모의 기기 서버. DB 가 없는 단일 모듈이라 도메인 계층 없이 controller + service + 클라이언트만 둔다.
 * `InfraModule` 을 쓰지 않으므로 (DB 연결을 연다) 에러 응답 필터를 직접 등록한다.
 */
@Module({
  imports: [
    serviceConfigModule({ defaults: { PORT: 3004 }, load: [mockDeviceConfig] }),
    LoggerModule,
  ],
  controllers: [HealthController, DeviceRequestsController],
  providers: [DeviceRequestsService, HubClient, { provide: APP_FILTER, useClass: ApiErrorFilter }],
})
export class AppModule {}
