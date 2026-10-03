import { Inject, Injectable } from '@nestjs/common';

import type { ReportDeviceResultsRequest } from '@repo/contracts/scm';
import { TransactionRunner } from '@repo/nest-kit/transaction-runner';

import { DeviceRequestService } from '../domains/device-request/application/device-request.service.js';

/**
 * 기기 서버가 시리얼별 처리 결과를 돌려준다. 페이지마다 보내도 되고 같은 시리얼을 다시 보내면 마지막 값이 이긴다.
 * 모르는 시리얼이 하나라도 있으면 전부 기록하지 않고 거절한다.
 */
@Injectable()
export class ReportDeviceResultsUsecase {
  constructor(
    @Inject(TransactionRunner) private readonly tx: TransactionRunner,
    private readonly deviceRequests: DeviceRequestService,
  ) {}

  execute(requestId: string, request: ReportDeviceResultsRequest): Promise<void> {
    return this.tx.run(() =>
      this.deviceRequests.recordResults(
        requestId,
        request.items.map(({ serialNumber, result, reason }) => ({
          serialNumber,
          result,
          reason: reason ?? null,
        })),
      ),
    );
  }
}
