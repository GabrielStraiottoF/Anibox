import { Controller, Get, Param, Query } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ContentProvider, ContentProviderService, MediaType, NormalizedMedia } from '../services/content-provider.service';

@Controller('media')
export class MediaController {
  constructor(private readonly contentProvider: ContentProviderService, private readonly prisma: PrismaService) {}

  @Get('search')
  search(
    @Query('q') q = '',
    @Query('type') type = 'ANIME',
    @Query('page') page = '1',
    @Query('perPage') perPage = '20',
    @Query('provider') provider = 'anilist',
  ) {
    return this.contentProvider.search(q, this.parseType(type), this.toPositiveInt(page, 1), this.toPositiveInt(perPage, 20), this.parseProvider(provider));
  }

  @Get('local/:id')
  async getLocal(@Param('id') id: string) {
    const media = await this.prisma.media.findUnique({ where: { id }, include: { _count: { select: { reviews: true, listMedia: true, history: true, tagVotes: true } } } });
    if (!media) return null;
    return media;
  }

  @Get(':type/:externalId')
  async getDetails(@Param('type') type: string, @Param('externalId') externalId: string, @Query('provider') provider = 'anilist') {
    const normalized = await this.contentProvider.getMediaDetails(externalId, this.parseType(type), this.parseProvider(provider));
    const persisted = await this.persist(normalized);
    return { ...normalized, id: persisted.id };
  }

  private async persist(media: NormalizedMedia) {
    return this.prisma.media.upsert({
      where: { externalId: media.externalId },
      create: { externalId: media.externalId, title: media.title, type: media.type, coverUrl: media.coverUrl, bannerUrl: media.bannerUrl, synopsis: media.synopsis, author: media.author, studio: media.studio, genres: media.genres, releaseYear: media.releaseYear, status: media.status, totalEpisodes: media.totalEpisodes, totalChapters: media.totalChapters },
      update: { title: media.title, type: media.type, coverUrl: media.coverUrl, bannerUrl: media.bannerUrl, synopsis: media.synopsis, author: media.author, studio: media.studio, genres: media.genres, releaseYear: media.releaseYear, status: media.status, totalEpisodes: media.totalEpisodes, totalChapters: media.totalChapters },
      select: { id: true },
    });
  }

  private parseType(value: string): MediaType { return value.toUpperCase() === 'MANGA' ? 'MANGA' : 'ANIME'; }
  private parseProvider(value: string): ContentProvider { const normalized = value.toLowerCase(); return normalized === 'jikan' || normalized === 'kitsu' ? normalized : 'anilist'; }
  private toPositiveInt(value: string, fallback: number): number { const parsed = Number.parseInt(value, 10); return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback; }
}
