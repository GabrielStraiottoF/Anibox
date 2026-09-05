import { Controller, Get, Param, Query } from '@nestjs/common';
import { ContentProvider, ContentProviderService, MediaType } from '../services/content-provider.service';

@Controller('media')
export class MediaController {
  constructor(private readonly contentProvider: ContentProviderService) {}

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

  @Get(':type/:externalId')
  getDetails(
    @Param('type') type: string,
    @Param('externalId') externalId: string,
    @Query('provider') provider = 'anilist',
  ) {
    return this.contentProvider.getMediaDetails(externalId, this.parseType(type), this.parseProvider(provider));
  }

  private parseType(value: string): MediaType {
    return value.toUpperCase() === 'MANGA' ? 'MANGA' : 'ANIME';
  }

  private parseProvider(value: string): ContentProvider {
    const normalized = value.toLowerCase();
    return normalized === 'jikan' || normalized === 'kitsu' ? normalized : 'anilist';
  }

  private toPositiveInt(value: string, fallback: number): number {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
