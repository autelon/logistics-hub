import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { accessLog } from '@repo/nest-kit/access-log';
import { httpConfig } from '@repo/nest-kit/config';
import { AppLogger } from '@repo/nest-kit/logger.module';

import { AppModule } from './app.module.js';

// 기동 로그를 모아 두었다가, 컨테이너에서 꺼낸 로거를 설치할 때 그 로거로 내보낸다.
const app = await NestFactory.create(AppModule, { bufferLogs: true });
app.useLogger(app.get(AppLogger));
app.use(accessLog);
app.enableShutdownHooks();

const http = app.get<ConfigType<typeof httpConfig>>(httpConfig.KEY);
await app.listen(http.port);
new Logger('Bootstrap').log(`device-api listening on :${http.port}`);
