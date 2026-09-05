import { MiddlewareConsumer, Module } from '@nestjs/common';
import { AuthModule } from './core/auth/auth.module';
import { MediaController } from './core/controllers/media.controller';
import { AuditMiddleware } from './core/middlewares/audit.middleware';
import { ContentProviderService } from './core/services/content-provider.service';
import { PrismaModule } from './core/prisma/prisma.module';
import { HealthController } from './health.controller';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [HealthController, MediaController],
  providers: [ContentProviderService, AuditMiddleware],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AuditMiddleware).forRoutes('*');
  }
}
