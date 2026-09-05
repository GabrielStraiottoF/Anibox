import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../guards/auth.guard';
import { CurrentUser } from '../decorators/current-user.decorator';
import { AuthenticatedUser } from '../types/auth.types';
import { CreateReviewCommentDto, CreateReviewDto, UpdateReviewDto } from './review.dto';
import { ReviewService } from './review.service';

@Controller('reviews')
export class ReviewController {
  constructor(private readonly reviews: ReviewService) {}

  @Get('media/:mediaId')
  listByMedia(@Param('mediaId') mediaId: string, @Query('page') page = '1', @Query('perPage') perPage = '20') {
    return this.reviews.listByMedia(mediaId, this.toInt(page, 1), this.toInt(perPage, 20));
  }

  @Get(':reviewId/comments')
  comments(@Param('reviewId') reviewId: string) {
    return this.reviews.comments(reviewId);
  }

  @UseGuards(AuthGuard)
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateReviewDto) {
    return this.reviews.create(user, dto);
  }

  @UseGuards(AuthGuard)
  @Patch(':reviewId')
  update(@CurrentUser() user: AuthenticatedUser, @Param('reviewId') reviewId: string, @Body() dto: UpdateReviewDto) {
    return this.reviews.update(user, reviewId, dto);
  }

  @UseGuards(AuthGuard)
  @Delete(':reviewId')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('reviewId') reviewId: string) {
    return this.reviews.remove(user, reviewId);
  }

  @UseGuards(AuthGuard)
  @Post(':reviewId/like')
  toggleLike(@CurrentUser() user: AuthenticatedUser, @Param('reviewId') reviewId: string) {
    return this.reviews.toggleLike(user, reviewId);
  }

  @UseGuards(AuthGuard)
  @Post(':reviewId/comments')
  addComment(@CurrentUser() user: AuthenticatedUser, @Param('reviewId') reviewId: string, @Body() dto: CreateReviewCommentDto) {
    return this.reviews.addComment(user, reviewId, dto);
  }

  @UseGuards(AuthGuard)
  @Delete('comments/:commentId')
  deleteComment(@CurrentUser() user: AuthenticatedUser, @Param('commentId') commentId: string) {
    return this.reviews.deleteComment(user, commentId);
  }

  private toInt(value: string, fallback: number): number {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
