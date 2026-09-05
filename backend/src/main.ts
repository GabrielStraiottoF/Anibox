import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './core/filters/global-exception.filter';

export async function createApp() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new GlobalExceptionFilter());

  const configuredOrigins =
    process.env.FRONTEND_URLS ??
    process.env.FRONTEND_URL ??
    (process.env.NODE_ENV === 'production' || process.env.VERCEL
      ? 'https://aniboxfront.vercel.app'
      : 'http://localhost:4200');

  const allowedOrigins = configuredOrigins
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  return app;
}

async function bootstrap() {
  const app = await createApp();
  const port = Number(process.env.PORT ?? 3000);

  await app.listen(port);

  console.log(`Anibox Backend rodando em http://localhost:${port}/api/v1`);
}

if (!process.env.VERCEL) {
  void bootstrap();
}
