import { Module } from '@nestjs/common';

import { UsecasesModule } from '../../usecases/usecases.module.js';
import { AsCaseEventsConsumer } from './as-case-events.consumer.js';

@Module({
  imports: [UsecasesModule],
  providers: [AsCaseEventsConsumer],
})
export class ConsumerModule {}
