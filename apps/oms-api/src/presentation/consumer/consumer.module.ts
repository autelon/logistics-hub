import { Module } from '@nestjs/common';

import { UsecasesModule } from '../../usecases/usecases.module.js';
import { AsCaseEventsConsumer } from './as-case-events.consumer.js';
import { ScmUnitEventsConsumer } from './scm-unit-events.consumer.js';

@Module({
  imports: [UsecasesModule],
  providers: [ScmUnitEventsConsumer, AsCaseEventsConsumer],
})
export class ConsumerModule {}
