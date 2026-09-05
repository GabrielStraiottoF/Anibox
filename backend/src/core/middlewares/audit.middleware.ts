import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as jwt from 'jsonwebtoken';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditMiddleware implements NestMiddleware {
  private readonly logger = new Logger(AuditMiddleware.name);

  constructor(private readonly prisma: PrismaService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const startedAt = Date.now();
    const method = req.method;
    const originalUrl = req.originalUrl;
    const userAgent = typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null;
    const ip = this.extractIp(req);
    const userId = this.tryGetUserId(req);

    res.on('finish', () => {
      const statusCode = res.statusCode;
      const durationMs = Date.now() - startedAt;
      const action = this.resolveAction(method, originalUrl, statusCode);
      const payload = { method, url: originalUrl, statusCode, durationMs, timestamp: new Date().toISOString() };
      this.logger.log(`[AUDIT] ${action} | user=${userId ?? 'anonymous'} | ${method} ${originalUrl} | ${statusCode} | ${durationMs}ms`);
      void this.persist({ userId, action, ip, userAgent, payload });
    });
    next();
  }

  private async persist(data: { userId: string | null; action: string; ip: string | null; userAgent: string | null; payload: Record<string, unknown> }): Promise<void> {
    try {
      await this.prisma.auditLog.create({ data: { userId: data.userId, action: data.action, ipAddress: data.ip, userAgent: data.userAgent, payload: data.payload } });
    } catch (error: any) {
      this.logger.error(`Falha ao persistir auditoria: ${error?.message ?? error}`);
    }
  }

  private tryGetUserId(req: Request): string | null {
    const header = req.headers.authorization;
    const token = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) return null;
    try {
      const secret = process.env.JWT_SECRET;
      const payload = secret ? jwt.verify(token, secret) : jwt.decode(token);
      const sub = typeof payload === 'object' && payload ? (payload as any).sub : null;
      return typeof sub === 'string' ? sub : null;
    } catch { return null; }
  }

  private extractIp(req: Request): string | null {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.length > 0) return forwarded.split(',')[0].trim();
    return req.ip || null;
  }

  private resolveAction(method: string, url: string, statusCode: number): string {
    if (url.includes('/auth/login') && method === 'POST') return statusCode < 400 ? 'USER_LOGIN_SUCCESS' : 'USER_LOGIN_FAILED';
    if (url.includes('/auth/register') && method === 'POST') return 'USER_REGISTRATION';
    if (url.includes('/auth/refresh') && method === 'POST') return 'TOKEN_REFRESH';
    if (url.includes('/auth/logout') && method === 'POST') return 'USER_LOGOUT';
    if (url.includes('/reviews')) return `REVIEW_${method}`;
    if (url.includes('/lists')) return `LIST_${method}`;
    if (url.includes('/users/delete-account') && method === 'DELETE') return 'ACCOUNT_DELETION';
    if (statusCode >= 400) return 'HTTP_ERROR';
    return 'GENERAL_ACCESS';
  }
}
