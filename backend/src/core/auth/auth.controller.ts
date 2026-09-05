import { Body, Controller, Delete, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthGuard } from '../guards/auth.guard';
import { CurrentUser } from '../decorators/current-user.decorator';
import { AuthenticatedUser } from '../types/auth.types';
import { AuthService } from './auth.service';
import { LoginDto, RegisterDto } from './auth.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() dto: RegisterDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    return this.withRefreshCookie(response, await this.authService.register(dto, this.metadata(request)));
  }

  @Post('login')
  async login(@Body() dto: LoginDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    return this.withRefreshCookie(response, await this.authService.login(dto, this.metadata(request)));
  }

  @Post('refresh')
  async refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    return this.withRefreshCookie(response, await this.authService.refresh(this.readRefreshCookie(request), this.metadata(request)));
  }

  @Post('logout')
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    await this.authService.logout(this.readRefreshCookie(request));
    this.clearRefreshCookie(response);
    return { success: true };
  }

  @UseGuards(AuthGuard)
  @Post('logout-all')
  async logoutAll(@CurrentUser() user: AuthenticatedUser, @Res({ passthrough: true }) response: Response) {
    await this.authService.logoutAll(user.id);
    this.clearRefreshCookie(response);
    return { success: true };
  }

  @UseGuards(AuthGuard)
  @Post('change-password')
  async changePassword(@CurrentUser() user: AuthenticatedUser, @Body() body: { currentPassword: string; newPassword: string }, @Res({ passthrough: true }) response: Response) {
    await this.authService.changePassword(user.id, body?.currentPassword ?? '', body?.newPassword ?? '');
    this.clearRefreshCookie(response);
    return { success: true };
  }

  @UseGuards(AuthGuard)
  @Delete('account')
  async deleteAccount(@CurrentUser() user: AuthenticatedUser, @Body() body: { password: string }, @Res({ passthrough: true }) response: Response) {
    await this.authService.deleteAccount(user.id, body?.password ?? '');
    this.clearRefreshCookie(response);
    return { success: true };
  }

  @UseGuards(AuthGuard)
  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser) { return this.authService.me(user.id); }

  private withRefreshCookie(response: Response, result: { response: unknown; refreshToken: string; refreshMaxAgeMs: number }) {
    response.cookie(this.authService.getRefreshCookieName(), result.refreshToken, this.authService.getRefreshCookieOptions(result.refreshMaxAgeMs));
    return result.response;
  }

  private clearRefreshCookie(response: Response): void {
    const production = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);
    response.clearCookie(this.authService.getRefreshCookieName(), { httpOnly: true, secure: production, sameSite: production ? 'none' : 'lax', path: '/api/v1/auth' });
  }

  private readRefreshCookie(request: Request): string {
    const header = request.headers.cookie ?? '';
    const prefix = `${this.authService.getRefreshCookieName()}=`;
    const part = header.split(';').map((item) => item.trim()).find((item) => item.startsWith(prefix));
    return part ? decodeURIComponent(part.slice(prefix.length)) : '';
  }

  private metadata(request: Request) {
    const forwarded = request.headers['x-forwarded-for'];
    const ip = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : request.ip;
    return { ip, userAgent: typeof request.headers['user-agent'] === 'string' ? request.headers['user-agent'] : undefined };
  }
}
