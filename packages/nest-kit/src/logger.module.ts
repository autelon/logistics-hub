import { ConsoleLogger, Global, Module } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';

import { logConfig } from './config.js';

/**
 * 애플리케이션 로거. 프로세스에 하나만 있고 main.ts 가 `app.useLogger(app.get(AppLogger))` 로 설치한다.
 * 다른 코드는 이것을 주입받지 않고 `new Logger(클래스.name)` 을 쓴다. 그 Logger 가 설치된 로거로 넘겨 준다.
 */
export class AppLogger extends ConsoleLogger {}

/** logConfig(LOG_LEVEL, LOG_FORMAT)로 설정한 AppLogger 를 제공한다. AppModule 에서 한 번 등록. */
@Global()
@Module({
  providers: [
    {
      provide: AppLogger,
      inject: [logConfig.KEY],
      useFactory: (log: ConfigType<typeof logConfig>) =>
        new AppLogger({
          json: log.format === 'json',
          // 하나만 주면 "이 수준 이상"으로 해석된다.
          logLevels: [log.level],
          // 메시지 뒤에 넘긴 객체(requestId 등)를 JSON 의 최상위 필드로 싣는다.
          flattenParams: true,
        }),
    },
  ],
  exports: [AppLogger],
})
export class LoggerModule {}
