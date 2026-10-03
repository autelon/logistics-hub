import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';

import {
  IntakeShipmentsRequest,
  LinkShipmentRequest,
  ShipmentListQuery,
  type IntakeShipmentsResult,
  type ShipmentDetailView,
  type ShipmentSummaryView,
} from '@repo/contracts/transport';
import { zod } from '@repo/nest-kit/zod.pipe';

import { GetShipmentUsecase } from '../../usecases/get-shipment.usecase.js';
import { IntakeShipmentsUsecase } from '../../usecases/intake-shipments.usecase.js';
import { LinkShipmentUsecase } from '../../usecases/link-shipment.usecase.js';
import { ListShipmentsUsecase } from '../../usecases/list-shipments.usecase.js';

/**
 * 제조사·포워더가 보고한 선적. 보고된 사실이라 받은 것은 거부하지 않고 이상으로 표시한다(모르는 SKU 만 UNKNOWN_SKU 로 거절).
 * 추가만 하고 수정·삭제는 없다. 발주에 연결되지 않은 선적은 운영자가 `link` 로 연결한다 (우리가 내리는 명령이라 거절할 수 있다).
 */
@Controller('shipments')
export class ShipmentsController {
  constructor(
    private readonly intakeShipments: IntakeShipmentsUsecase,
    private readonly listShipments: ListShipmentsUsecase,
    private readonly getShipment: GetShipmentUsecase,
    private readonly linkShipment: LinkShipmentUsecase,
  ) {}

  /** B/L·시리얼 목록 제출을 한꺼번에 기록한다 (1..200건, 한 트랜잭션). 응답은 요청과 같은 순서. */
  @Post('intake')
  intake(
    @Body(zod(IntakeShipmentsRequest)) body: IntakeShipmentsRequest,
  ): Promise<IntakeShipmentsResult> {
    return this.intakeShipments.execute(body);
  }

  /** 최근 50건. `poNumber` 는 연결된 발주, `unlinked=true` 는 발주에 연결되지 않은 선적. */
  @Get()
  list(@Query(zod(ShipmentListQuery)) query: ShipmentListQuery): Promise<ShipmentSummaryView[]> {
    return this.listShipments.execute(query);
  }

  /** 현재 번호나 연결하기 전 번호(`UNLINKED-…`)로 찾는다. */
  @Get(':shipmentNo')
  get(@Param('shipmentNo') shipmentNo: string): Promise<ShipmentDetailView> {
    return this.getShipment.execute(shipmentNo);
  }

  @Post(':shipmentNo/link')
  link(
    @Param('shipmentNo') shipmentNo: string,
    @Body(zod(LinkShipmentRequest)) body: LinkShipmentRequest,
  ): Promise<ShipmentDetailView> {
    return this.linkShipment.execute(shipmentNo, body);
  }
}
