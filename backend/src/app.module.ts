import { MiddlewareConsumer, Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { AuditMiddleware } from './core/middlewares/audit.middleware';
import { ContentProviderService } from './core/services/content-provider.service';

@Module({
  imports: [],
  controllers: [HealthController],
  providers: [ContentProviderService],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(AuditMiddleware).forRoutes('*');
  }
}
