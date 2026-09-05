import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '../guards/auth.guard';
import { CurrentUser } from '../decorators/current-user.decorator';
import { AuthenticatedUser } from '../types/auth.types';
import { CommunityService } from './community.service';
import type { Request } from 'express';

@Controller('lists')
export class ListsController {
  constructor(private readonly community: CommunityService) {}

  @UseGuards(AuthGuard)
  @Get()
  list(@CurrentUser() user: AuthenticatedUser) { return this.community.lists(user.id); }

  @UseGuards(AuthGuard)
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: any) { return this.community.createList(user.id, body); }

  @Get(':id')
  get(@Param('id') id: string, @Req() request: Request) {
    const header = request.headers.authorization;
    return this.community.getList(this.readUserId(header), id);
  }

  @UseGuards(AuthGuard)
  @Patch(':id')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() body: any) { return this.community.updateList(user.id, id, body); }

  @UseGuards(AuthGuard)
  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.community.deleteList(user.id, id); }

  @UseGuards(AuthGuard)
  @Post(':id/media/:mediaId')
  addMedia(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Param('mediaId') mediaId: string) { return this.community.addToList(user.id, id, mediaId); }

  @UseGuards(AuthGuard)
  @Delete(':id/media/:mediaId')
  removeMedia(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Param('mediaId') mediaId: string) { return this.community.removeFromList(user.id, id, mediaId); }

  private readUserId(header?: string): string | null {
    return null;
  }
}
