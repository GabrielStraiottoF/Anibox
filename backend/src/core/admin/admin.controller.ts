import { Controller, Delete, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../guards/auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { Roles } from '../decorators/roles.decorator';
import { CurrentUser } from '../decorators/current-user.decorator';
import { AuthenticatedUser } from '../types/auth.types';
import { AdminService } from './admin.service';

@UseGuards(AuthGuard, RolesGuard)
@Roles('MODERATOR', 'ADMIN')
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('users')
  users(@Query('page') page = '1', @Query('perPage') perPage = '50', @Query('q') query?: string) { return this.admin.users(this.int(page), this.int(perPage), query); }

  @Patch('users/:id/ban')
  ban(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.admin.setBan(user, id, true); }

  @Patch('users/:id/unban')
  unban(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.admin.setBan(user, id, false); }

  @Delete('users/:id')
  @Roles('ADMIN')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.admin.deleteUser(user, id); }

  @Get('audit')
  @Roles('ADMIN')
  audit(@Query('page') page = '1', @Query('perPage') perPage = '50', @Query('userId') userId?: string) { return this.admin.audit(this.int(page), this.int(perPage), userId); }

  private int(value: string): number { const parsed = Number.parseInt(value, 10); return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 1000) : 1; }
}
