import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';

import {
  DeviceRequestUnitsQuery,
  ReportDeviceResultsRequest,
  type DeviceRequestDetailView,
  type DeviceRequestUnitsPage,
  type DeviceRequestView,
} from '@repo/contracts/scm';
import { zod } from '@repo/nest-kit/zod.pipe';

import { GetDeviceRequestUsecase } from '../../usecases/get-device-request.usecase.js';
import { ListDeviceRequestUnitsUsecase } from '../../usecases/list-device-request-units.usecase.js';
import { ListDeviceRequestsUsecase } from '../../usecases/list-device-requests.usecase.js';
import { ReportDeviceResultsUsecase } from '../../usecases/report-device-results.usecase.js';

/**
 * 기기 요청. `units` 와 `results` 는 기기 서버가 부르고, 나머지 둘은 운영 화면이 부른다.
 * 흐름: 우리가 기기 서버에 requestId 를 알린다 → 기기 서버가 `units` 를 페이지로 가져간다 → `results` 로 결과를 돌려준다.
 */
@Controller('device-requests')
export class DeviceRequestsController {
  constructor(
    private readonly listRequests: ListDeviceRequestsUsecase,
    private readonly getRequest: GetDeviceRequestUsecase,
    private readonly listUnits: ListDeviceRequestUnitsUsecase,
    private readonly reportResults: ReportDeviceResultsUsecase,
  ) {}

  @Get(':id/units')
  units(
    @Param('id') id: string,
    @Query(zod(DeviceRequestUnitsQuery)) query: DeviceRequestUnitsQuery,
  ): Promise<DeviceRequestUnitsPage> {
    return this.listUnits.execute(id, query);
  }

  @Post(':id/results')
  @HttpCode(204)
  async results(
    @Param('id') id: string,
    @Body(zod(ReportDeviceResultsRequest)) body: ReportDeviceResultsRequest,
  ): Promise<void> {
    await this.reportResults.execute(id, body);
  }

  @Get()
  list(): Promise<DeviceRequestView[]> {
    return this.listRequests.execute();
  }

  @Get(':id')
  detail(@Param('id') id: string): Promise<DeviceRequestDetailView> {
    return this.getRequest.execute(id);
  }
}
