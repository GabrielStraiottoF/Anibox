import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './core/filters/global-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new GlobalExceptionFilter());

  const configuredOrigins = process.env.FRONTEND_URLS ?? process.env.FRONTEND_URL ?? 'http://localhost:4200';
  const allowedOrigins = configuredOrigins
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
}

void bootstrap();
