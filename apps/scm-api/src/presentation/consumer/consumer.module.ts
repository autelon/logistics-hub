import { Module } from '@nestjs/common';

import { UsecasesModule } from '../../usecases/usecases.module.js';
import { AsCaseEventsConsumer } from './as-case-events.consumer.js';
import { DeviceRequestsConsumer } from './device-requests.consumer.js';

@Module({
  imports: [UsecasesModule],
  providers: [AsCaseEventsConsumer, DeviceRequestsConsumer],
})
export class ConsumerModule {}
