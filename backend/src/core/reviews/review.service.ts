import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../types/auth.types';
import { CreateReviewCommentDto, CreateReviewDto, UpdateReviewDto } from './review.dto';

@Injectable()
export class ReviewService {
  constructor(private readonly prisma: PrismaService) {}

  async create(user: AuthenticatedUser, dto: CreateReviewDto) {
    const rating = this.normalizeRating(dto.rating);
    const content = this.normalizeContent(dto.content, 5000);
    const media = await this.prisma.media.findUnique({ where: { id: dto.mediaId }, select: { id: true, title: true } });
    if (!media) throw new NotFoundException('Obra não encontrada.');
    const existing = await this.prisma.review.findFirst({ where: { userId: user.id, mediaId: dto.mediaId }, select: { id: true } });
    if (existing) throw new BadRequestException('Você já possui uma avaliação para esta obra.');

    return this.prisma.$transaction(async (tx) => {
      const review = await tx.review.create({
        data: { userId: user.id, mediaId: dto.mediaId, rating, content, isSpoiler: Boolean(dto.isSpoiler), versions: { create: { rating, content } } },
        include: { user: { select: { id: true, username: true, profile: { select: { avatarUrl: true } } } } },
      });
      await tx.activity.create({ data: { userId: user.id, type: 'REVIEW_CREATED', payload: { reviewId: review.id, mediaId: media.id, mediaTitle: media.title, rating } } });
      await this.recalculateMediaRating(tx, dto.mediaId);
      return review;
    });
  }

  async listByMedia(mediaId: string, page = 1, perPage = 20) {
    page = Math.max(1, Math.min(page, 1000));
    perPage = Math.max(1, Math.min(perPage, 50));
    const [items, total] = await this.prisma.$transaction([
      this.prisma.review.findMany({ where: { mediaId }, orderBy: { createdAt: 'desc' }, skip: (page - 1) * perPage, take: perPage, include: { user: { select: { id: true, username: true, profile: { select: { avatarUrl: true } } } } } }),
      this.prisma.review.count({ where: { mediaId } }),
    ]);
    return { items, page, perPage, total, hasNextPage: page * perPage < total };
  }

  async update(user: AuthenticatedUser, reviewId: string, dto: UpdateReviewDto) {
    const review = await this.prisma.review.findUnique({ where: { id: reviewId }, select: { id: true, userId: true, mediaId: true, rating: true, content: true, isSpoiler: true } });
    if (!review) throw new NotFoundException('Avaliação não encontrada.');
    if (review.userId !== user.id) throw new ForbiddenException('Você não pode editar esta avaliação.');
    const rating = dto.rating === undefined ? review.rating : this.normalizeRating(dto.rating);
    const content = dto.content === undefined ? review.content : this.normalizeContent(dto.content, 5000);
    const isSpoiler = dto.isSpoiler === undefined ? review.isSpoiler : Boolean(dto.isSpoiler);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.review.update({ where: { id: reviewId }, data: { rating, content, isSpoiler, versions: { create: { rating, content } } }, include: { user: { select: { id: true, username: true, profile: { select: { avatarUrl: true } } } } } });
      await tx.activity.create({ data: { userId: user.id, type: 'REVIEW_UPDATED', payload: { reviewId, mediaId: review.mediaId, rating } } });
      await this.recalculateMediaRating(tx, review.mediaId);
      return updated;
    });
  }

  async remove(user: AuthenticatedUser, reviewId: string): Promise<{ success: true }> {
    const review = await this.prisma.review.findUnique({ where: { id: reviewId }, select: { id: true, userId: true, mediaId: true } });
    if (!review) throw new NotFoundException('Avaliação não encontrada.');
    if (review.userId !== user.id && user.role !== 'ADMIN' && user.role !== 'MODERATOR') throw new ForbiddenException('Você não pode excluir esta avaliação.');
    await this.prisma.$transaction(async (tx) => {
      await tx.review.delete({ where: { id: reviewId } });
      await this.recalculateMediaRating(tx, review.mediaId);
    });
    return { success: true };
  }

  async toggleLike(user: AuthenticatedUser, reviewId: string): Promise<{ liked: boolean; likeCount: number }> {
    const review = await this.prisma.review.findUnique({ where: { id: reviewId }, select: { id: true, userId: true, likeCount: true } });
    if (!review) throw new NotFoundException('Avaliação não encontrada.');
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.reviewLike.findUnique({ where: { userId_reviewId: { userId: user.id, reviewId } } });
      if (existing) {
        await tx.reviewLike.delete({ where: { userId_reviewId: { userId: user.id, reviewId } } });
        const updated = await tx.review.update({ where: { id: reviewId }, data: { likeCount: { decrement: 1 } }, select: { likeCount: true } });
        return { liked: false, likeCount: Math.max(0, updated.likeCount) };
      }
      await tx.reviewLike.create({ data: { userId: user.id, reviewId } });
      const updated = await tx.review.update({ where: { id: reviewId }, data: { likeCount: { increment: 1 } }, select: { likeCount: true } });
      if (review.userId !== user.id) await tx.notification.create({ data: { userId: review.userId, type: 'LIKE', message: 'Sua avaliação recebeu uma curtida.', payload: { reviewId, userId: user.id } } });
      return { liked: true, likeCount: updated.likeCount };
    });
  }

  async comments(reviewId: string) {
    return this.prisma.reviewComment.findMany({ where: { reviewId }, orderBy: { createdAt: 'asc' }, include: { user: { select: { id: true, username: true, profile: { select: { avatarUrl: true } } } } } });
  }

  async addComment(user: AuthenticatedUser, reviewId: string, dto: CreateReviewCommentDto) {
    const review = await this.prisma.review.findUnique({ where: { id: reviewId }, select: { id: true, userId: true } });
    if (!review) throw new NotFoundException('Avaliação não encontrada.');
    const content = this.normalizeContent(dto.content, 1000);
    return this.prisma.$transaction(async (tx) => {
      const comment = await tx.reviewComment.create({ data: { userId: user.id, reviewId, content, isSpoiler: Boolean(dto.isSpoiler) }, include: { user: { select: { id: true, username: true, profile: { select: { avatarUrl: true } } } } } });
      await tx.review.update({ where: { id: reviewId }, data: { commentCount: { increment: 1 } } });
      if (review.userId !== user.id) await tx.notification.create({ data: { userId: review.userId, type: 'COMMENT', message: 'Sua avaliação recebeu um novo comentário.', payload: { reviewId, commentId: comment.id, userId: user.id } } });
      await tx.activity.create({ data: { userId: user.id, type: 'REVIEW_COMMENTED', payload: { reviewId, commentId: comment.id } } });
      return comment;
    });
  }

  async deleteComment(user: AuthenticatedUser, commentId: string): Promise<{ success: true }> {
    const comment = await this.prisma.reviewComment.findUnique({ where: { id: commentId }, select: { id: true, userId: true, reviewId: true } });
    if (!comment) throw new NotFoundException('Comentário não encontrado.');
    if (comment.userId !== user.id && user.role !== 'ADMIN' && user.role !== 'MODERATOR') throw new ForbiddenException('Você não pode excluir este comentário.');
    await this.prisma.$transaction(async (tx) => {
      await tx.reviewComment.delete({ where: { id: commentId } });
      await tx.review.update({ where: { id: comment.reviewId }, data: { commentCount: { decrement: 1 } } });
    });
    return { success: true };
  }

  private normalizeRating(value: unknown): number { const rating = Number(value); if (!Number.isFinite(rating) || rating < 1 || rating > 5) throw new BadRequestException('A nota deve estar entre 1 e 5.'); return Math.round(rating * 2) / 2; }
  private normalizeContent(value: unknown, maxLength: number): string { const content = String(value ?? '').trim(); if (!content) throw new BadRequestException('O conteúdo é obrigatório.'); if (content.length > maxLength) throw new BadRequestException(`O conteúdo deve ter no máximo ${maxLength} caracteres.`); return content; }
  private async recalculateMediaRating(tx: any, mediaId: string): Promise<void> { const aggregate = await tx.review.aggregate({ where: { mediaId }, _avg: { rating: true }, _count: { _all: true } }); await tx.media.update({ where: { id: mediaId }, data: { averageRating: Number(aggregate._avg.rating ?? 0), ratingCount: aggregate._count._all } }); }
}
