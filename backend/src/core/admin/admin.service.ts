import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../types/auth.types';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async users(page = 1, perPage = 50, query?: string) {
    page = Math.max(1, Math.min(page, 1000));
    perPage = Math.max(1, Math.min(perPage, 100));
    const where: Prisma.UserWhereInput = query?.trim()
      ? { OR: [{ username: { contains: query.trim(), mode: 'insensitive' } }, { email: { contains: query.trim(), mode: 'insensitive' } }] }
      : {};
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({ where, skip: (page - 1) * perPage, take: perPage, orderBy: { createdAt: 'desc' }, select: { id: true, email: true, username: true, role: true, isBanned: true, createdAt: true, updatedAt: true, profile: true, _count: { select: { followers: true, following: true, reviews: true, lists: true, history: true } } } }),
      this.prisma.user.count({ where }),
    ]);
    return { items, page, perPage, total, totalPages: Math.ceil(total / perPage) };
  }

  async setBan(actor: AuthenticatedUser, userId: string, banned: boolean) {
    if (actor.id === userId) throw new BadRequestException('Você não pode alterar o próprio banimento.');
    const target = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, username: true, role: true } });
    if (!target) throw new NotFoundException('Usuário não encontrado.');
    if (target.role === 'ADMIN' && actor.role !== 'ADMIN') throw new ForbiddenException('Somente administradores podem moderar administradores.');
    const user = await this.prisma.user.update({ where: { id: userId }, data: { isBanned: banned }, select: { id: true, username: true, role: true, isBanned: true } });
    if (banned) await this.prisma.session.deleteMany({ where: { userId } });
    await this.prisma.auditLog.create({ data: { userId: actor.id, action: banned ? 'ADMIN_BAN' : 'ADMIN_UNBAN', payload: { targetUserId: userId } } });
    return user;
  }

  async deleteUser(actor: AuthenticatedUser, userId: string) {
    if (actor.id === userId) throw new BadRequestException('Use o endpoint de exclusão da própria conta.');
    const target = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true, username: true } });
    if (!target) throw new NotFoundException('Usuário não encontrado.');
    if (target.role === 'ADMIN' && actor.role !== 'ADMIN') throw new ForbiddenException('Somente administradores podem excluir administradores.');
    await this.prisma.user.delete({ where: { id: userId } });
    await this.prisma.auditLog.create({ data: { userId: actor.id, action: 'ADMIN_DELETE_USER', payload: { targetUserId: userId, username: target.username } } });
    return { success: true };
  }

  async audit(page = 1, perPage = 50, userId?: string) {
    page = Math.max(1, Math.min(page, 1000));
    perPage = Math.max(1, Math.min(perPage, 100));
    const where = userId ? { userId } : {};
    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({ where, skip: (page - 1) * perPage, take: perPage, orderBy: { createdAt: 'desc' }, include: { user: { select: { id: true, username: true } } } }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { items, page, perPage, total, totalPages: Math.ceil(total / perPage) };
  }
}
