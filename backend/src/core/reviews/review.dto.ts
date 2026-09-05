export interface CreateReviewDto {
  mediaId: string;
  rating: number;
  content: string;
  isSpoiler?: boolean;
}

export interface UpdateReviewDto {
  rating?: number;
  content?: string;
  isSpoiler?: boolean;
}

export interface CreateReviewCommentDto {
  content: string;
  isSpoiler?: boolean;
}
