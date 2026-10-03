import { Module } from '@nestjs/common';

import { DeviceRequestService } from './application/device-request.service.js';
import { DeviceRequestRepository } from './domain/device-request.repository.js';
import { DeviceServerGateway } from './domain/device-server.gateway.js';
import { DrizzleDeviceRequestRepository } from './infra/drizzle-device-request.repository.js';
import { HttpDeviceServerGateway } from './infra/http-device-server.gateway.js';

@Module({
  providers: [
    DeviceRequestService,
    { provide: DeviceRequestRepository, useClass: DrizzleDeviceRequestRepository },
    { provide: DeviceServerGateway, useClass: HttpDeviceServerGateway },
  ],
  exports: [DeviceRequestService],
})
export class DeviceRequestModule {}
