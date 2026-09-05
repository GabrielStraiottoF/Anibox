import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { ContentProviderService, NormalizedMedia } from '../services/content-provider.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../types/auth.types';

export type LibraryInput = {
  mediaId?: string;
  externalId?: string;
  type?: 'ANIME' | 'MANGA';
  status?: 'PLANNING' | 'CURRENT' | 'COMPLETED' | 'DROPPED' | 'PAUSED';
  progress?: number;
  score?: number | null;
  startDate?: string | null;
  endDate?: string | null;
};

export type ListInput = { name: string; description?: string | null; isPublic?: boolean };

@Injectable()
export class CommunityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: ContentProviderService,
  ) {}

  async getOwnProfile(userId: string) {
    return this.getUserProfileById(userId, true);
  }

  async updateOwnProfile(userId: string, input: { username?: string; bio?: string | null; avatarUrl?: string | null; bannerUrl?: string | null }) {
    if (input.username !== undefined && !/^[a-zA-Z0-9_.-]{3,32}$/.test(input.username.trim())) {
      throw new BadRequestException('Username inválido.');
    }
    if (input.bio !== undefined && input.bio !== null && input.bio.length > 500) {
      throw new BadRequestException('Bio deve ter no máximo 500 caracteres.');
    }
    try {
      const user = await this.prisma.user.update({
        where: { id: userId },
        data: {
          username: input.username?.trim(),
          profile: { upsert: { create: { bio: input.bio ?? null, avatarUrl: input.avatarUrl ?? null, bannerUrl: input.bannerUrl ?? null }, update: { bio: input.bio, avatarUrl: input.avatarUrl, bannerUrl: input.bannerUrl } } },
        },
        select: { id: true, email: true, username: true, role: true, createdAt: true, profile: true },
      });
      return user;
    } catch (error: any) {
      if (error?.code === 'P2002') throw new ConflictException('Username já cadastrado.');
      throw error;
    }
  }

  async getUserProfile(username: string) {
    return this.getUserProfileByUsername(username, false);
  }

  async follow(userId: string, targetUserId: string) {
    if (userId === targetUserId) throw new BadRequestException('Você não pode seguir a si mesmo.');
    const target = await this.prisma.user.findUnique({ where: { id: targetUserId }, select: { id: true, username: true, isBanned: true } });
    if (!target || target.isBanned) throw new NotFoundException('Usuário não encontrado.');
    const follow = await this.prisma.follow.upsert({
      where: { followerId_followingId: { followerId: userId, followingId: targetUserId } },
      create: { followerId: userId, followingId: targetUserId },
      update: {},
    });
    await this.prisma.notification.create({ data: { userId: targetUserId, type: 'FOLLOW', message: 'Você ganhou um novo seguidor.', payload: { followerId: userId } } }).catch(() => undefined);
    return follow;
  }

  async unfollow(userId: string, targetUserId: string) {
    await this.prisma.follow.deleteMany({ where: { followerId: userId, followingId: targetUserId } });
    return { success: true };
  }

  async followers(userId: string, page = 1, perPage = 20) {
    const skip = (page - 1) * perPage;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.follow.findMany({ where: { followingId: userId }, skip, take: perPage, orderBy: { createdAt: 'desc' }, include: { follower: { select: { id: true, username: true, profile: true } } } }),
      this.prisma.follow.count({ where: { followingId: userId } }),
    ]);
    return { items: items.map((item) => item.follower), page, perPage, total, totalPages: Math.ceil(total / perPage) };
  }

  async following(userId: string, page = 1, perPage = 20) {
    const skip = (page - 1) * perPage;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.follow.findMany({ where: { followerId: userId }, skip, take: perPage, orderBy: { createdAt: 'desc' }, include: { following: { select: { id: true, username: true, profile: true } } } }),
      this.prisma.follow.count({ where: { followerId: userId } }),
    ]);
    return { items: items.map((item) => item.following), page, perPage, total, totalPages: Math.ceil(total / perPage) };
  }

  async getLibrary(userId: string, status?: LibraryInput['status'], page = 1, perPage = 20) {
    const skip = (page - 1) * perPage;
    const where: Prisma.AcquisitionHistoryWhereInput = { userId, ...(status ? { status } : {}) };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.acquisitionHistory.findMany({ where, skip, take: perPage, orderBy: { updatedAt: 'desc' }, include: { media: true } }),
      this.prisma.acquisitionHistory.count({ where }),
    ]);
    return { items, page, perPage, total, totalPages: Math.ceil(total / perPage) };
  }

  async upsertLibrary(userId: string, input: LibraryInput) {
    if (input.progress !== undefined && (!Number.isInteger(input.progress) || input.progress < 0)) throw new BadRequestException('Progresso inválido.');
    if (input.score !== undefined && input.score !== null && (input.score < 0 || input.score > 5)) throw new BadRequestException('Nota deve estar entre 0 e 5.');
    const media = await this.resolveMedia(input);
    const existing = await this.prisma.acquisitionHistory.findFirst({ where: { userId, mediaId: media.id }, orderBy: { updatedAt: 'desc' } });
    const data = {
      status: input.status,
      progress: input.progress,
      score: input.score,
      startDate: input.startDate === undefined ? undefined : (input.startDate ? new Date(input.startDate) : null),
      endDate: input.endDate === undefined ? undefined : (input.endDate ? new Date(input.endDate) : null),
    };
    return existing
      ? this.prisma.acquisitionHistory.update({ where: { id: existing.id }, data, include: { media: true } })
      : this.prisma.acquisitionHistory.create({ data: { userId, mediaId: media.id, status: input.status ?? 'PLANNING', progress: input.progress ?? 0, score: input.score ?? null, startDate: input.startDate ? new Date(input.startDate) : null, endDate: input.endDate ? new Date(input.endDate) : null }, include: { media: true } });
  }

  async removeFromLibrary(userId: string, mediaId: string) {
    await this.prisma.acquisitionHistory.deleteMany({ where: { userId, mediaId } });
    return { success: true };
  }

  async lists(userId: string, includePrivate = true) {
    return this.prisma.list.findMany({ where: includePrivate ? { userId } : { userId, isPublic: true }, orderBy: { updatedAt: 'desc' }, include: { _count: { select: { mediaItems: true } } } });
  }

  async createList(userId: string, input: ListInput) {
    const name = input.name?.trim();
    if (!name || name.length > 100) throw new BadRequestException('Nome da lista é obrigatório e deve ter até 100 caracteres.');
    if (input.description && input.description.length > 500) throw new BadRequestException('Descrição deve ter até 500 caracteres.');
    return this.prisma.list.create({ data: { userId, name, description: input.description ?? null, isPublic: input.isPublic ?? true } });
  }

  async getList(userId: string | null, listId: string) {
    const list = await this.prisma.list.findUnique({ where: { id: listId }, include: { user: { select: { id: true, username: true, profile: true } }, mediaItems: { orderBy: { createdAt: 'desc' }, include: { media: true } } } });
    if (!list) throw new NotFoundException('Lista não encontrada.');
    if (!list.isPublic && list.userId !== userId) throw new ForbiddenException('Lista privada.');
    return list;
  }

  async updateList(userId: string, listId: string, input: ListInput) {
    await this.assertListOwner(userId, listId);
    return this.prisma.list.update({ where: { id: listId }, data: { name: input.name?.trim(), description: input.description, isPublic: input.isPublic } });
  }

  async deleteList(userId: string, listId: string) {
    await this.assertListOwner(userId, listId);
    await this.prisma.list.delete({ where: { id: listId } });
    return { success: true };
  }

  async addToList(userId: string, listId: string, mediaId: string) {
    await this.assertListOwner(userId, listId);
    await this.ensureMediaExists(mediaId);
    return this.prisma.listMedia.upsert({ where: { listId_mediaId: { listId, mediaId } }, create: { listId, mediaId }, update: {} });
  }

  async removeFromList(userId: string, listId: string, mediaId: string) {
    await this.assertListOwner(userId, listId);
    await this.prisma.listMedia.deleteMany({ where: { listId, mediaId } });
    return { success: true };
  }

  async feed(userId: string, page = 1, perPage = 20) {
    const skip = (page - 1) * perPage;
    const followed = await this.prisma.follow.findMany({ where: { followerId: userId }, select: { followingId: true } });
    const ids = [userId, ...followed.map((item) => item.followingId)];
    const [items, total] = await this.prisma.$transaction([
      this.prisma.activity.findMany({ where: { userId: { in: ids } }, skip, take: perPage, orderBy: { createdAt: 'desc' }, include: { user: { select: { id: true, username: true, profile: true } } } }),
      this.prisma.activity.count({ where: { userId: { in: ids } } }),
    ]);
    return { items, page, perPage, total, totalPages: Math.ceil(total / perPage) };
  }

  async notifications(userId: string, unreadOnly = false, page = 1, perPage = 20) {
    const skip = (page - 1) * perPage;
    const where = { userId, ...(unreadOnly ? { read: false } : {}) };
    const [items, total, unread] = await this.prisma.$transaction([
      this.prisma.notification.findMany({ where, skip, take: perPage, orderBy: { createdAt: 'desc' } }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId, read: false } }),
    ]);
    return { items, unread, page, perPage, total, totalPages: Math.ceil(total / perPage) };
  }

  async markNotificationRead(userId: string, id: string) {
    const result = await this.prisma.notification.updateMany({ where: { id, userId }, data: { read: true } });
    if (!result.count) throw new NotFoundException('Notificação não encontrada.');
    return { success: true };
  }

  async markAllNotificationsRead(userId: string) {
    await this.prisma.notification.updateMany({ where: { userId, read: false }, data: { read: true } });
    return { success: true };
  }

  async tags(query?: string, limit = 50) {
    return this.prisma.tag.findMany({ where: query ? { name: { contains: query, mode: 'insensitive' } } : undefined, take: Math.min(Math.max(limit, 1), 100), orderBy: { name: 'asc' }, include: { _count: { select: { mediaVotes: true } } } });
  }

  async createTag(user: AuthenticatedUser, name: string, isNsfw = false, isSensitive = false) {
    if (user.role === 'USER') throw new ForbiddenException('Somente moderadores podem criar tags.');
    const normalized = name?.trim();
    if (!normalized || normalized.length > 50) throw new BadRequestException('Nome da tag inválido.');
    try { return await this.prisma.tag.create({ data: { name: normalized, isNsfw, isSensitive } }); } catch (error: any) { if (error?.code === 'P2002') throw new ConflictException('Tag já existe.'); throw error; }
  }

  async voteTag(userId: string, mediaId: string, tagId: string, vote: number) {
    if (![1, -1].includes(vote)) throw new BadRequestException('Voto deve ser 1 ou -1.');
    await this.ensureMediaExists(mediaId);
    const tag = await this.prisma.tag.findUnique({ where: { id: tagId } });
    if (!tag) throw new NotFoundException('Tag não encontrada.');
    return this.prisma.mediaTagVote.upsert({ where: { mediaId_tagId_userId: { mediaId, tagId, userId } }, create: { mediaId, tagId, userId, vote }, update: { vote } });
  }

  private async getUserProfileById(userId: string, includeEmail: boolean) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: includeEmail, username: true, role: true, createdAt: true, profile: true, _count: { select: { followers: true, following: true, reviews: true, lists: true } } } });
    if (!user) throw new NotFoundException('Usuário não encontrado.');
    return user;
  }

  private async getUserProfileByUsername(username: string, includeEmail: boolean) {
    const user = await this.prisma.user.findUnique({ where: { username }, select: { id: true, email: includeEmail, username: true, role: true, createdAt: true, profile: true, _count: { select: { followers: true, following: true, reviews: true, lists: true } } } });
    if (!user) throw new NotFoundException('Usuário não encontrado.');
    return user;
  }

  private async assertListOwner(userId: string, listId: string) {
    const list = await this.prisma.list.findUnique({ where: { id: listId }, select: { id: true, userId: true } });
    if (!list) throw new NotFoundException('Lista não encontrada.');
    if (list.userId !== userId) throw new ForbiddenException('Você não é o proprietário desta lista.');
  }

  private async ensureMediaExists(mediaId: string) {
    const media = await this.prisma.media.findUnique({ where: { id: mediaId } });
    if (!media) throw new NotFoundException('Mídia não encontrada.');
    return media;
  }

  private async resolveMedia(input: LibraryInput) {
    if (input.mediaId) return this.ensureMediaExists(input.mediaId);
    if (!input.externalId) throw new BadRequestException('mediaId ou externalId é obrigatório.');
    const type = input.type ?? 'ANIME';
    const found = await this.prisma.media.findFirst({ where: { externalId: input.externalId } });
    if (found) return found;
    const external = await this.provider.getMediaDetails(input.externalId, type, 'anilist');
    return this.persistExternalMedia(external);
  }

  private async persistExternalMedia(media: NormalizedMedia) {
    const existing = await this.prisma.media.findFirst({ where: { externalId: media.externalId } });
    if (existing) return existing;
    return this.prisma.media.create({ data: { externalId: media.externalId, title: media.title, type: media.type, coverUrl: media.coverUrl, bannerUrl: media.bannerUrl, synopsis: media.synopsis, author: media.author, studio: media.studio, genres: media.genres, releaseYear: media.releaseYear, status: media.status, totalEpisodes: media.totalEpisodes, totalChapters: media.totalChapters } });
  }
}
