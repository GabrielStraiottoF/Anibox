import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes, scrypt as nodeScrypt } from 'node:crypto';
import { promisify } from 'node:util';
import * as jwt from 'jsonwebtoken';
import { PrismaService } from '../prisma/prisma.service';
import { AccessTokenPayload, AuthenticatedUser, RefreshTokenPayload } from '../types/auth.types';
import { LoginDto, RegisterDto } from './auth.dto';

const scrypt = promisify(nodeScrypt);
const REFRESH_COOKIE = 'aniboxd_refresh_token';
type JwtExpires = jwt.SignOptions['expiresIn'];

export interface AuthResponse { accessToken: string; user: AuthenticatedUser }
export interface IssuedSession { response: AuthResponse; refreshToken: string; refreshMaxAgeMs: number }

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async register(dto: RegisterDto, metadata: { ip?: string; userAgent?: string }): Promise<IssuedSession> {
    const email = dto.email?.trim().toLowerCase();
    const username = dto.username?.trim();
    const password = dto.password ?? '';
    this.validateCredentials(email, password);
    if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username)) throw new BadRequestException('Username deve ter entre 3 e 32 caracteres e conter apenas letras, números, _, - ou .');
    const existing = await this.prisma.user.findFirst({ where: { OR: [{ email }, { username }] }, select: { email: true } });
    if (existing) throw new ConflictException(existing.email === email ? 'E-mail já cadastrado.' : 'Username já cadastrado.');
    const user = await this.prisma.user.create({ data: { email, username, passwordHash: await this.hashPassword(password), profile: { create: {} } }, select: { id: true, email: true, username: true, role: true } });
    return this.createIssuedSession(user, metadata);
  }

  async login(dto: LoginDto, metadata: { ip?: string; userAgent?: string }): Promise<IssuedSession> {
    const email = dto.email?.trim().toLowerCase();
    const password = dto.password ?? '';
    this.validateCredentials(email, password);
    const user = await this.prisma.user.findUnique({ where: { email }, select: { id: true, email: true, username: true, role: true, isBanned: true, passwordHash: true } });
    if (!user || user.isBanned || !(await this.verifyPassword(password, user.passwordHash))) throw new UnauthorizedException('E-mail ou senha inválidos.');
    return this.createIssuedSession(user, metadata);
  }

  async refresh(refreshToken: string, metadata: { ip?: string; userAgent?: string }): Promise<IssuedSession> {
    if (!refreshToken) throw new UnauthorizedException('Refresh token não informado.');
    const secret = process.env.REFRESH_TOKEN_SECRET;
    if (!secret) throw new UnauthorizedException('Autenticação indisponível no servidor.');
    let payload: RefreshTokenPayload;
    try {
      payload = jwt.verify(refreshToken, secret) as RefreshTokenPayload;
      if (payload.type !== 'refresh' || !payload.sub || !payload.sessionId) throw new Error('invalid token');
    } catch { throw new UnauthorizedException('Refresh token inválido ou expirado.'); }
    const session = await this.prisma.session.findUnique({ where: { id: payload.sessionId }, include: { user: { select: { id: true, email: true, username: true, role: true, isBanned: true } } } });
    if (!session || session.tokenHash !== this.hashToken(refreshToken) || session.expiresAt <= new Date() || session.user.isBanned || session.user.id !== payload.sub) throw new UnauthorizedException('Sessão inválida ou expirada.');
    await this.prisma.session.delete({ where: { id: session.id } });
    return this.createIssuedSession(session.user, metadata);
  }

  async logout(refreshToken: string): Promise<void> {
    if (refreshToken) await this.prisma.session.deleteMany({ where: { tokenHash: this.hashToken(refreshToken) } });
  }

  async logoutAll(userId: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { userId } });
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    this.validatePassword(newPassword);
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
    if (!user || !(await this.verifyPassword(currentPassword, user.passwordHash))) throw new UnauthorizedException('Senha atual inválida.');
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash: await this.hashPassword(newPassword) } });
    await this.prisma.session.deleteMany({ where: { userId } });
  }

  async deleteAccount(userId: string, password: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
    if (!user || !(await this.verifyPassword(password, user.passwordHash))) throw new UnauthorizedException('Senha inválida.');
    await this.prisma.user.delete({ where: { id: userId } });
  }

  async me(userId: string): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, username: true, role: true, isBanned: true } });
    if (!user || user.isBanned) throw new UnauthorizedException('Usuário não autorizado.');
    return this.buildUser(user);
  }

  getRefreshCookieName(): string { return REFRESH_COOKIE; }
  getRefreshCookieOptions(maxAge: number) {
    const production = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);
    return { httpOnly: true, secure: production, sameSite: production ? ('none' as const) : ('lax' as const), path: '/api/v1/auth', maxAge };
  }

  private async createIssuedSession(user: { id: string; email: string; username: string; role: AuthenticatedUser['role'] }, metadata: { ip?: string; userAgent?: string }): Promise<IssuedSession> {
    const secret = process.env.REFRESH_TOKEN_SECRET;
    if (!secret || !process.env.JWT_SECRET) throw new UnauthorizedException('Autenticação indisponível no servidor.');
    const refreshMaxAgeMs = this.parseDuration(process.env.REFRESH_TOKEN_EXPIRES_IN, 7 * 86_400_000);
    const placeholder = randomBytes(48).toString('base64url');
    const session = await this.prisma.session.create({ data: { userId: user.id, tokenHash: this.hashToken(placeholder), deviceInfo: metadata.userAgent?.slice(0, 500), ipAddress: metadata.ip?.slice(0, 100), expiresAt: new Date(Date.now() + refreshMaxAgeMs) } });
    const signed = jwt.sign({ sub: user.id, sessionId: session.id, type: 'refresh' } satisfies RefreshTokenPayload, secret, { expiresIn: (process.env.REFRESH_TOKEN_EXPIRES_IN as JwtExpires) || '7d' });
    await this.prisma.session.update({ where: { id: session.id }, data: { tokenHash: this.hashToken(signed) } });
    return { response: this.buildAuthResponse(user), refreshToken: signed, refreshMaxAgeMs };
  }

  private buildAuthResponse(user: { id: string; email: string; username: string; role: AuthenticatedUser['role'] }): AuthResponse {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new UnauthorizedException('Autenticação indisponível no servidor.');
    return { accessToken: jwt.sign({ sub: user.id, email: user.email, username: user.username, role: user.role, type: 'access' } satisfies AccessTokenPayload, secret, { expiresIn: (process.env.JWT_EXPIRES_IN as JwtExpires) || '15m' }), user: this.buildUser(user) };
  }

  private buildUser(user: { id: string; email: string; username: string; role: AuthenticatedUser['role'] }): AuthenticatedUser { return { id: user.id, email: user.email, username: user.username, role: user.role }; }
  private validateCredentials(email: string, password: string): void { if (!email || !/^\S+@\S+\.\S+$/.test(email)) throw new BadRequestException('E-mail inválido.'); this.validatePassword(password); }
  private validatePassword(password: string): void { if (password.length < 8 || password.length > 200) throw new BadRequestException('A senha deve ter entre 8 e 200 caracteres.'); }
  private async hashPassword(password: string): Promise<string> { const salt = randomBytes(16).toString('hex'); const derived = (await scrypt(password, salt, 64)) as Buffer; return `scrypt$${salt}$${derived.toString('hex')}`; }
  private async verifyPassword(password: string, stored: string): Promise<boolean> { const [algorithm, salt, digest] = stored.split('$'); if (algorithm !== 'scrypt' || !salt || !digest) return false; const derived = (await scrypt(password, salt, 64)) as Buffer; return derived.toString('hex') === digest; }
  private hashToken(token: string): string { return createHash('sha256').update(token).digest('hex'); }
  private parseDuration(value: string | undefined, fallback: number): number { if (!value) return fallback; if (/^\d+$/.test(value)) return Number(value) * 1000; const match = value.trim().match(/^(\d+)\s*(s|m|h|d)$/i); if (!match) return fallback; const multipliers = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }; return Number(match[1]) * multipliers[match[2].toLowerCase() as keyof typeof multipliers]; }
}
