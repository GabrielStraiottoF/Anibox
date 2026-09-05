import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';

export type MediaType = 'ANIME' | 'MANGA';
export type ContentProvider = 'anilist' | 'jikan' | 'kitsu';

export interface NormalizedMedia {
  externalId: string;
  title: string;
  type: MediaType;
  coverUrl: string | null;
  bannerUrl: string | null;
  synopsis: string | null;
  author: string | null;
  studio: string | null;
  genres: string[];
  releaseYear: number | null;
  status: 'AIRING' | 'FINISHED' | 'UPCOMING' | 'HIATUS' | 'CANCELLED';
  totalEpisodes: number;
  totalChapters: number;
  provider: ContentProvider;
}

export interface MediaSearchResult {
  items: NormalizedMedia[];
  page: number;
  perPage: number;
  hasNextPage: boolean;
  provider: ContentProvider;
}

enum CircuitState { CLOSED, OPEN, HALF_OPEN }
interface ProviderState { state: CircuitState; failures: number; lastStateChange: number }

@Injectable()
export class ContentProviderService {
  private readonly logger = new Logger(ContentProviderService.name);
  private readonly cache = new Map<string, { expiresAt: number; data: unknown }>();
  private readonly providerStates: Record<ContentProvider, ProviderState> = {
    anilist: { state: CircuitState.CLOSED, failures: 0, lastStateChange: Date.now() },
    jikan: { state: CircuitState.CLOSED, failures: 0, lastStateChange: Date.now() },
    kitsu: { state: CircuitState.CLOSED, failures: 0, lastStateChange: Date.now() },
  };
  private readonly failureThreshold = 3;
  private readonly cooldownMs = 30_000;
  private readonly timeoutMs = Number(process.env.CONTENT_API_TIMEOUT_MS ?? 5000);

  async getMediaDetails(externalId: string, type: MediaType, provider: ContentProvider = 'anilist'): Promise<NormalizedMedia> {
    if (!externalId?.trim()) throw new HttpException('ID externo é obrigatório.', HttpStatus.BAD_REQUEST);
    const cacheKey = `media:${provider}:${type}:${externalId}`;
    const cached = this.getCache<NormalizedMedia>(cacheKey);
    if (cached) return cached;

    const providers: ContentProvider[] = [provider, ...(['anilist', 'jikan', 'kitsu'] as ContentProvider[]).filter((item) => item !== provider)];
    let lastError: unknown;
    for (const candidate of providers) {
      try {
        const data = await this.withCircuitBreaker(candidate, () => this.fetchMedia(candidate, externalId, type));
        this.setCache(cacheKey, data, candidate === provider ? 3600 : 1800);
        return data;
      } catch (error) {
        lastError = error;
        this.logger.warn(`Provider ${candidate} falhou para ${type}/${externalId}.`);
      }
    }
    const notFound = lastError instanceof HttpException && lastError.getStatus() === HttpStatus.NOT_FOUND;
    throw new HttpException(notFound ? 'Obra não encontrada nos provedores disponíveis.' : 'Não foi possível obter a obra no momento.', notFound ? HttpStatus.NOT_FOUND : HttpStatus.SERVICE_UNAVAILABLE);
  }

  async search(query: string, type: MediaType = 'ANIME', page = 1, perPage = 20, provider: ContentProvider = 'anilist'): Promise<MediaSearchResult> {
    const normalizedQuery = query?.trim();
    if (!normalizedQuery) throw new HttpException('Parâmetro q é obrigatório.', HttpStatus.BAD_REQUEST);
    page = Math.max(1, Math.min(page, 1000));
    perPage = Math.max(1, Math.min(perPage, 50));
    const cacheKey = `search:${provider}:${type}:${page}:${perPage}:${normalizedQuery.toLowerCase()}`;
    const cached = this.getCache<MediaSearchResult>(cacheKey);
    if (cached) return cached;
    const result = await this.withCircuitBreaker(provider, () => this.searchProvider(provider, normalizedQuery, type, page, perPage));
    this.setCache(cacheKey, result, 300);
    return result;
  }

  private async withCircuitBreaker<T>(provider: ContentProvider, operation: () => Promise<T>): Promise<T> {
    const state = this.providerStates[provider];
    if (state.state === CircuitState.OPEN) {
      if (Date.now() - state.lastStateChange < this.cooldownMs) throw new Error(`Circuit open: ${provider}`);
      state.state = CircuitState.HALF_OPEN;
    }
    try {
      const result = await operation();
      state.state = CircuitState.CLOSED;
      state.failures = 0;
      return result;
    } catch (error) {
      state.failures += 1;
      if (state.state === CircuitState.HALF_OPEN || state.failures >= this.failureThreshold) {
        state.state = CircuitState.OPEN;
        state.lastStateChange = Date.now();
      }
      throw error;
    }
  }

  private fetchMedia(provider: ContentProvider, id: string, type: MediaType): Promise<NormalizedMedia> {
    if (provider === 'anilist') return this.fetchAniListMedia(id, type);
    if (provider === 'jikan') return this.fetchJikanMedia(id, type);
    return this.fetchKitsuMedia(id, type);
  }

  private searchProvider(provider: ContentProvider, query: string, type: MediaType, page: number, perPage: number): Promise<MediaSearchResult> {
    if (provider === 'anilist') return this.searchAniList(query, type, page, perPage);
    if (provider === 'jikan') return this.searchJikan(query, type, page, perPage);
    return this.searchKitsu(query, type, page, perPage);
  }

  private async fetchAniListMedia(id: string, type: MediaType): Promise<NormalizedMedia> {
    const response = await this.requestJson(this.env('ANILIST_API_URL', 'https://graphql.anilist.co'), {
      method: 'POST',
      headers: this.headers('ANILIST_API_KEY', 'application/json'),
      body: JSON.stringify({ query: `query ($id: Int, $type: MediaType) { Media(id: $id, type: $type) { id type title { romaji english native } coverImage { large } bannerImage description(asHtml: false) staff { nodes { name { full } } } studios { nodes { name } } genres seasonYear status episodes chapters } }`, variables: { id: Number(id), type } }),
    });
    const media = response?.data?.Media;
    if (!media) throw new HttpException('Obra não encontrada.', HttpStatus.NOT_FOUND);
    return this.normalizeAniList(media);
  }

  private async searchAniList(query: string, type: MediaType, page: number, perPage: number): Promise<MediaSearchResult> {
    const response = await this.requestJson(this.env('ANILIST_API_URL', 'https://graphql.anilist.co'), {
      method: 'POST',
      headers: this.headers('ANILIST_API_KEY', 'application/json'),
      body: JSON.stringify({ query: `query ($search: String!, $type: MediaType, $page: Int, $perPage: Int) { Page(page: $page, perPage: $perPage) { pageInfo { hasNextPage } media(search: $search, type: $type) { id type title { romaji english native } coverImage { large } bannerImage description(asHtml: false) staff { nodes { name { full } } } studios { nodes { name } } genres seasonYear status episodes chapters } } }`, variables: { search: query, type, page, perPage } }),
    });
    const pageData = response?.data?.Page;
    if (!pageData) throw new Error('Resposta inválida da AniList.');
    return { items: (pageData.media ?? []).map((media: any) => this.normalizeAniList(media)), page, perPage, hasNextPage: Boolean(pageData.pageInfo?.hasNextPage), provider: 'anilist' };
  }

  private normalizeAniList(media: any): NormalizedMedia {
    return { externalId: String(media.id), title: media.title?.english || media.title?.romaji || media.title?.native || 'Sem título', type: media.type === 'MANGA' ? 'MANGA' : 'ANIME', coverUrl: media.coverImage?.large || null, bannerUrl: media.bannerImage || null, synopsis: media.description || null, author: media.staff?.nodes?.[0]?.name?.full || null, studio: media.studios?.nodes?.[0]?.name || null, genres: Array.isArray(media.genres) ? media.genres : [], releaseYear: media.seasonYear ?? null, status: this.mapStatus(media.status), totalEpisodes: media.episodes ?? 0, totalChapters: media.chapters ?? 0, provider: 'anilist' };
  }

  private async fetchJikanMedia(id: string, type: MediaType): Promise<NormalizedMedia> {
    const resource = type === 'ANIME' ? 'anime' : 'manga';
    const data = await this.requestJson(`${this.env('JIKAN_API_URL', 'https://api.jikan.moe/v4')}/${resource}/${encodeURIComponent(id)}/full`, { headers: this.headers('JIKAN_API_KEY', 'application/json') });
    if (!data?.data) throw new HttpException('Obra não encontrada.', HttpStatus.NOT_FOUND);
    return this.normalizeJikan(data.data, type);
  }

  private async searchJikan(query: string, type: MediaType, page: number, perPage: number): Promise<MediaSearchResult> {
    const resource = type === 'ANIME' ? 'anime' : 'manga';
    const url = `${this.env('JIKAN_API_URL', 'https://api.jikan.moe/v4')}/${resource}?q=${encodeURIComponent(query)}&page=${page}&limit=${perPage}`;
    const data = await this.requestJson(url, { headers: this.headers('JIKAN_API_KEY', 'application/json') });
    return { items: (data?.data ?? []).map((media: any) => this.normalizeJikan(media, type)), page, perPage, hasNextPage: Boolean(data?.pagination?.has_next_page), provider: 'jikan' };
  }

  private normalizeJikan(media: any, type: MediaType): NormalizedMedia {
    return { externalId: String(media.mal_id), title: media.title || media.title_english || media.title_japanese || 'Sem título', type, coverUrl: media.images?.jpg?.large_image_url || media.images?.jpg?.image_url || null, bannerUrl: null, synopsis: media.synopsis || null, author: media.authors?.[0]?.name || null, studio: media.studios?.[0]?.name || null, genres: (media.genres ?? []).map((genre: any) => genre.name).filter(Boolean), releaseYear: media.aired?.prop?.from?.year ?? media.published?.prop?.from?.year ?? null, status: this.mapStatus(media.status), totalEpisodes: media.episodes ?? 0, totalChapters: media.chapters ?? 0, provider: 'jikan' };
  }

  private async fetchKitsuMedia(id: string, type: MediaType): Promise<NormalizedMedia> {
    const resource = type === 'ANIME' ? 'anime' : 'manga';
    const data = await this.requestJson(`${this.env('KITSU_API_URL', 'https://kitsu.io/api/edge')}/${resource}/${encodeURIComponent(id)}`, { headers: this.headers('KITSU_API_KEY', 'application/vnd.api+json') });
    if (!data?.data?.attributes) throw new HttpException('Obra não encontrada.', HttpStatus.NOT_FOUND);
    return this.normalizeKitsu(data.data, type);
  }

  private async searchKitsu(query: string, type: MediaType, page: number, perPage: number): Promise<MediaSearchResult> {
    const resource = type === 'ANIME' ? 'anime' : 'manga';
    const offset = (page - 1) * perPage;
    const url = `${this.env('KITSU_API_URL', 'https://kitsu.io/api/edge')}/${resource}?filter[text]=${encodeURIComponent(query)}&page[limit]=${perPage}&page[offset]=${offset}`;
    const data = await this.requestJson(url, { headers: this.headers('KITSU_API_KEY', 'application/vnd.api+json') });
    return { items: (data?.data ?? []).map((item: any) => this.normalizeKitsu(item, type)), page, perPage, hasNextPage: Boolean(data?.links?.next), provider: 'kitsu' };
  }

  private normalizeKitsu(media: any, type: MediaType): NormalizedMedia {
    const attributes = media.attributes ?? {};
    return { externalId: String(media.id), title: attributes.canonicalTitle || attributes.titles?.en || attributes.titles?.en_jp || 'Sem título', type, coverUrl: attributes.posterImage?.large || attributes.posterImage?.original || null, bannerUrl: attributes.coverImage?.large || attributes.coverImage?.original || null, synopsis: attributes.synopsis || null, author: null, studio: null, genres: [], releaseYear: attributes.startDate ? Number(String(attributes.startDate).slice(0, 4)) : null, status: this.mapStatus(attributes.status), totalEpisodes: attributes.episodeCount ?? 0, totalChapters: attributes.chapterCount ?? 0, provider: 'kitsu' };
  }

  private mapStatus(value: unknown): NormalizedMedia['status'] {
    const status = String(value ?? '').toUpperCase();
    if (status.includes('FINISH') || status.includes('COMPLETE')) return 'FINISHED';
    if (status.includes('AIRING') || status.includes('CURRENT') || status.includes('RELEAS')) return 'AIRING';
    if (status.includes('HIATUS')) return 'HIATUS';
    if (status.includes('CANCEL')) return 'CANCELLED';
    return 'UPCOMING';
  }

  private headers(keyName: string, accept: string): Record<string, string> {
    const headers: Record<string, string> = { Accept: accept };
    const key = process.env[keyName];
    if (key) headers.Authorization = `Bearer ${key}`;
    return headers;
  }

  private env(name: string, fallback: string): string { return process.env[name]?.trim() || fallback; }

  private async requestJson(url: string, init: RequestInit): Promise<any> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status === 404) throw new HttpException('Recurso não encontrado.', HttpStatus.NOT_FOUND);
        throw new Error(`Provider HTTP ${response.status}`);
      }
      return body;
    } catch (error: any) {
      if (error?.name === 'AbortError') throw new Error('Provider timeout');
      throw error;
    } finally { clearTimeout(timeout); }
  }

  private getCache<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) { this.cache.delete(key); return null; }
    return entry.data as T;
  }

  private setCache(key: string, data: unknown, ttlSeconds: number): void { this.cache.set(key, { data, expiresAt: Date.now() + ttlSeconds * 1000 }); }
}
