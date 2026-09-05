import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ContentProviderService } from '../services/content-provider.service';
import { CommunityService } from './community.service';
import { UsersController } from './users.controller';
import { LibraryController } from './library.controller';
import { ListsController } from './lists.controller';
import { SocialController } from './social.controller';

@Module({
  imports: [PrismaModule],
  controllers: [UsersController, LibraryController, ListsController, SocialController],
  providers: [ContentProviderService, CommunityService],
  exports: [CommunityService],
})
export class CommunityModule {}
