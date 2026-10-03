import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';

import { Topics } from '@repo/contracts/common';
import { DeviceRequestCreated } from '@repo/contracts/scm';
import type { MessageBus } from '@repo/messaging/message-bus';
import { MESSAGE_BUS } from '@repo/nest-kit/infra.module';

import { NotifyDeviceRequestUsecase } from '../../usecases/notify-device-request.usecase.js';

/**
 * 기기 요청이 만들어졌다는 우리 자신의 이벤트를 받아 기기 서버에 알린다.
 * 알림이 실패하면 던진다 → 메시지가 확인 처리되지 않아 잠시 뒤 다시 시도된다.
 */
@Injectable()
export class DeviceRequestsConsumer implements OnApplicationBootstrap {
  private readonly logger = new Logger(DeviceRequestsConsumer.name);

  constructor(
    @Inject(MESSAGE_BUS) private readonly bus: MessageBus,
    private readonly notifyDeviceRequest: NotifyDeviceRequestUsecase,
  ) {}

  async onApplicationBootstrap() {
    await this.bus.subscribe(Topics.scmDeviceRequests, 'scm-api', (message) =>
      this.handle(message.value),
    );
  }

  async handle(value: unknown) {
    const parsed = DeviceRequestCreated.safeParse(value);
    if (!parsed.success) {
      this.logger.warn(`Ignoring unrecognized message: ${JSON.stringify(value)}`);
      return;
    }

    const result = await this.notifyDeviceRequest.execute(parsed.data);
    const { requestId, type, count } = parsed.data.payload;
    if (result === 'unknown-request') {
      // 요청 행은 이벤트와 같은 트랜잭션으로 커밋되므로 일어나지 않아야 한다. 재시도해도 같으니 버린다.
      this.logger.error(`Device request ${requestId} does not exist`);
      return;
    }
    this.logger.log(`Device request ${requestId} (${type}, ${count} units): ${result}`);
  }
}
