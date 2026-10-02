import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { httpConfig } from '@repo/nest-kit/config';

import { AppModule } from './app.module.js';

const app = await NestFactory.create(AppModule);
app.enableShutdownHooks();

const http = app.get<ConfigType<typeof httpConfig>>(httpConfig.KEY);
await app.listen(http.port);
new Logger('Bootstrap').log(`scm-api listening on :${http.port}`);
