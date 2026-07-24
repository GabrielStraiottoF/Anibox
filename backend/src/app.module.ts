import { Module, MiddlewareConsumer } from '@nestjs/common';
import { AuditMiddleware } from './core/middlewares/audit.middleware';
import { ContentProviderService } from './core/services/content-provider.service';

@Module({
  imports: [],
  controllers: [],
  providers: [ContentProviderService],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(AuditMiddleware).forRoutes('*');
  }
}
