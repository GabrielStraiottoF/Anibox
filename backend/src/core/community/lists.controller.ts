import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../guards/auth.guard';
import { CurrentUser } from '../decorators/current-user.decorator';
import { AuthenticatedUser } from '../types/auth.types';
import { CommunityService } from './community.service';
import type { Request } from 'express';
import * as jwt from 'jsonwebtoken';

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
  get(@Param('id') id: string, @Req() request: Request) { return this.community.getList(this.readUserId(request), id); }

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

  private readUserId(request: Request): string | null {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) return null;
    const secret = process.env.JWT_SECRET;
    if (!secret) return null;
    try {
      const payload = jwt.verify(header.slice(7).trim(), secret) as jwt.JwtPayload;
      return typeof payload.sub === 'string' ? payload.sub : null;
    } catch { return null; }
  }
}
