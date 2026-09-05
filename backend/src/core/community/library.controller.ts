import { Body, Controller, Delete, Get, Param, Put, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../guards/auth.guard';
import { CurrentUser } from '../decorators/current-user.decorator';
import { AuthenticatedUser } from '../types/auth.types';
import { CommunityService, LibraryInput } from './community.service';

@UseGuards(AuthGuard)
@Controller('library')
export class LibraryController {
  constructor(private readonly community: CommunityService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query('status') status?: LibraryInput['status'], @Query('page') page = '1', @Query('perPage') perPage = '20') {
    return this.community.getLibrary(user.id, status, this.int(page), this.int(perPage));
  }

  @Put(':mediaId')
  upsert(@CurrentUser() user: AuthenticatedUser, @Param('mediaId') mediaId: string, @Body() body: Omit<LibraryInput, 'mediaId'>) {
    return this.community.upsertLibrary(user.id, { ...body, mediaId });
  }

  @Delete(':mediaId')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('mediaId') mediaId: string) { return this.community.removeFromLibrary(user.id, mediaId); }

  private int(value: string): number { const parsed = Number.parseInt(value, 10); return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 1000) : 1; }
}
