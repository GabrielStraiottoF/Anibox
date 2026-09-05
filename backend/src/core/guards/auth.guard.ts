import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import * as jwt from 'jsonwebtoken';
import { PrismaService } from '../prisma/prisma.service';
import { AccessTokenPayload, AuthenticatedUser } from '../types/auth.types';

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) throw new UnauthorizedException('Token de acesso não informado.');

    const secret = process.env.JWT_SECRET;
    if (!secret) throw new UnauthorizedException('Autenticação indisponível no servidor.');

    let payload: AccessTokenPayload;
    try {
      payload = jwt.verify(token, secret) as AccessTokenPayload;
      if (payload.type !== 'access' || !payload.sub) throw new Error('invalid token');
    } catch {
      throw new UnauthorizedException('Token de acesso inválido ou expirado.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, username: true, role: true, isBanned: true },
    });
    if (!user || user.isBanned) throw new UnauthorizedException('Usuário não autorizado.');

    request.user = { id: user.id, email: user.email, username: user.username, role: user.role };
    return true;
  }
}
