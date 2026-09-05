import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../guards/auth.guard';
import { CurrentUser } from '../decorators/current-user.decorator';
import { AuthenticatedUser } from '../types/auth.types';
import { CommunityService } from './community.service';

@Controller('users')
export class UsersController {
  constructor(private readonly community: CommunityService) {}

  @UseGuards(AuthGuard)
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) { return this.community.getOwnProfile(user.id); }

  @UseGuards(AuthGuard)
  @Patch('me')
  updateMe(@CurrentUser() user: AuthenticatedUser, @Body() body: any) { return this.community.updateOwnProfile(user.id, body); }

  @Get(':username')
  profile(@Param('username') username: string) { return this.community.getUserProfile(username); }

  @UseGuards(AuthGuard)
  @Post(':id/follow')
  follow(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.community.follow(user.id, id); }

  @UseGuards(AuthGuard)
  @Delete(':id/follow')
  unfollow(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.community.unfollow(user.id, id); }

  @Get(':id/followers')
  followers(@Param('id') id: string, @Query('page') page = '1', @Query('perPage') perPage = '20') { return this.community.followers(id, this.toInt(page), this.toInt(perPage)); }

  @Get(':id/following')
  following(@Param('id') id: string, @Query('page') page = '1', @Query('perPage') perPage = '20') { return this.community.following(id, this.toInt(page), this.toInt(perPage)); }

  private toInt(value: string): number { const parsed = Number.parseInt(value, 10); return Number.isFinite(parsed) && parsed > 0 ? parsed : 1; }
}
