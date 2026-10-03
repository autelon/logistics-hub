import { Module } from '@nestjs/common';

import { ShipmentService } from './application/shipment.service.js';
import { ShipmentRepository } from './domain/shipment.repository.js';
import { DrizzleShipmentRepository } from './infra/drizzle-shipment.repository.js';

@Module({
  providers: [
    ShipmentService,
    { provide: ShipmentRepository, useClass: DrizzleShipmentRepository },
  ],
  exports: [ShipmentService],
})
export class TransportModule {}
