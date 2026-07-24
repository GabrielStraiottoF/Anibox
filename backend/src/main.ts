import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './core/filters/global-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Prefixo global da API
  app.setGlobalPrefix('api/v1');

  // Filtro global de exceções
  app.useGlobalFilters(new GlobalExceptionFilter());

  // CORS para o frontend Angular em desenvolvimento
  app.enableCors({
    origin: ['http://localhost:4200'],
    credentials: true,
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`✅ Aniboxd Backend rodando em: http://localhost:${port}/api/v1`);
}

bootstrap();
