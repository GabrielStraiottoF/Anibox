import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../guards/auth.guard';
import { CurrentUser } from '../decorators/current-user.decorator';
import { AuthenticatedUser } from '../types/auth.types';
import { CommunityService } from './community.service';

@Controller()
export class SocialController {
  constructor(private readonly community: CommunityService) {}

  @UseGuards(AuthGuard)
  @Get('feed')
  feed(@CurrentUser() user: AuthenticatedUser, @Query('page') page = '1', @Query('perPage') perPage = '20') { return this.community.feed(user.id, this.int(page), this.int(perPage)); }

  @UseGuards(AuthGuard)
  @Get('notifications')
  notifications(@CurrentUser() user: AuthenticatedUser, @Query('unreadOnly') unreadOnly = 'false', @Query('page') page = '1', @Query('perPage') perPage = '20') { return this.community.notifications(user.id, unreadOnly === 'true', this.int(page), this.int(perPage)); }

  @UseGuards(AuthGuard)
  @Patch('notifications/:id/read')
  markRead(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.community.markNotificationRead(user.id, id); }

  @UseGuards(AuthGuard)
  @Patch('notifications/read-all')
  markAllRead(@CurrentUser() user: AuthenticatedUser) { return this.community.markAllNotificationsRead(user.id); }

  @Get('tags')
  tags(@Query('q') query?: string, @Query('limit') limit = '50') { return this.community.tags(query, this.int(limit)); }

  @UseGuards(AuthGuard)
  @Post('tags')
  createTag(@CurrentUser() user: AuthenticatedUser, @Body() body: any) { return this.community.createTag(user, body?.name, Boolean(body?.isNsfw), Boolean(body?.isSensitive)); }

  @UseGuards(AuthGuard)
  @Post('tag-votes/:mediaId/:tagId')
  vote(@CurrentUser() user: AuthenticatedUser, @Param('mediaId') mediaId: string, @Param('tagId') tagId: string, @Body() body: any) { return this.community.voteTag(user.id, mediaId, tagId, Number(body?.vote)); }

  private int(value: string): number { const parsed = Number.parseInt(value, 10); return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 1000) : 1; }
}
