import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module.js';
import { env } from './env.js';

const app = await NestFactory.create(AppModule);
app.enableShutdownHooks();
await app.listen(env.PORT);
Logger.log(`scm-api listening on :${env.PORT}`, 'Bootstrap');
