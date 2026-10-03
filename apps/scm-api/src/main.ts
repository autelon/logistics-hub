import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { accessLog } from '@repo/nest-kit/access-log';
import { httpConfig } from '@repo/nest-kit/config';
import { AppLogger } from '@repo/nest-kit/logger.module';

import { AppModule } from './app.module.js';

// 기동 로그를 모아 두었다가, 컨테이너에서 꺼낸 로거를 설치할 때 그 로거로 내보낸다.
const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
// 제품 등록 명령은 시리얼을 최대 5000개, 선적 제출은 요청당 최대 50000개 받는다. 기본 한도(100KB)로는 모자라 4MB 로 올린다.
app.useBodyParser('json', { limit: '4mb' });
app.useLogger(app.get(AppLogger));
app.use(accessLog);
app.enableShutdownHooks();

const http = app.get<ConfigType<typeof httpConfig>>(httpConfig.KEY);
await app.listen(http.port);
new Logger('Bootstrap').log(`scm-api listening on :${http.port}`);
