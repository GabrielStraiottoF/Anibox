import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { Observable, of, throwError, firstValueFrom } from 'rxjs';
import { catchError, map, timeout, retry } from 'rxjs/operators';

export interface NormalizedMedia {
  externalId: string;
  title: string;
  type: 'ANIME' | 'MANGA' | 'MANHWA' | 'MANHUA' | 'LIGHT_NOVEL' | 'WEBTOON';
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
}

enum CircuitState {
  CLOSED,
  OPEN,
  HALF_OPEN
}

@Injectable()
export class ContentProviderService {
  private readonly logger = new Logger(ContentProviderService.name);
  
  // Cache simulado ou injeção do Redis (neste esqueleto simulamos por simplicidade)
  private redisCache = new Map<string, { data: NormalizedMedia; expiresAt: number }>();
  
  // Configurações do Circuit Breaker para APIs externas
  private circuitStates = {
    anilist: CircuitState.CLOSED,
    jikan: CircuitState.CLOSED,
    kitsu: CircuitState.CLOSED
  };
  private failureCounts = { anilist: 0, jikan: 0, kitsu: 0 };
  private lastStateChange = { anilist: Date.now(), jikan: Date.now(), kitsu: Date.now() };
  
  private readonly FAILURE_THRESHOLD = 3; // falhas para abrir o circuito
  private readonly COOLDOWN_PERIOD = 30000; // 30s de cooldown para tentar half-open
  private readonly TIMEOUT_LIMIT = 3000; // 3s de timeout

  constructor() {}

  /**
   * Busca e unifica detalhes de obras por ID externo
   */
  async getMediaDetails(externalId: string, type: 'ANIME' | 'MANGA'): Promise<NormalizedMedia> {
    const cacheKey = `media:${type.toLowerCase()}:${externalId}`;
    
    // 1. Verificar Cache (Redis/Memória)
    const cached = this.getCache(cacheKey);
    if (cached) {
      this.logger.debug(`[Cache Hit] Retornando mídia cacheada para chave: ${cacheKey}`);
      return cached;
    }

    this.logger.log(`[Cache Miss] Buscando mídia externa: id=${externalId}, tipo=${type}`);

    // 2. Tentar API Principal (AniList) com Circuit Breaker e Failover
    try {
      const data = await this.executeWithCircuitBreaker(
        'anilist',
        () => this.fetchFromAniList(externalId, type)
      );
      this.setCache(cacheKey, data, 3600); // 1 hora de cache
      return data;
    } catch (error: any) {
      this.logger.warn(`[Failover] AniList falhou. Tentando Jikan API... Erro: ${error.message}`);
      
      // 3. Fallback para API Secundária (Jikan)
      try {
        const data = await this.executeWithCircuitBreaker(
          'jikan',
          () => this.fetchFromJikan(externalId, type)
        );
        this.setCache(cacheKey, data, 1800); // 30 minutos de cache
        return data;
      } catch (jikanError: any) {
        this.logger.warn(`[Failover] Jikan falhou. Tentando Kitsu API... Erro: ${jikanError.message}`);
        
        // 4. Fallback Terciário (Kitsu)
        try {
          const data = await this.executeWithCircuitBreaker(
            'kitsu',
            () => this.fetchFromKitsu(externalId, type)
          );
          this.setCache(cacheKey, data, 1800);
          return data;
        } catch (kitsuError: any) {
          this.logger.error(`[Fatal] Todas as APIs de conteúdo falharam para a mídia ID: ${externalId}`);
          throw new HttpException(
            'Não foi possível obter os dados da obra no momento devido à indisponibilidade nos provedores externos.',
            HttpStatus.SERVICE_UNAVAILABLE
          );
        }
      }
    }
  }

  /**
   * Executa uma função protegendo-a com uma máquina de estados de Circuit Breaker
   */
  private async executeWithCircuitBreaker(
    apiName: 'anilist' | 'jikan' | 'kitsu',
    apiCall: () => Promise<NormalizedMedia>
  ): Promise<NormalizedMedia> {
    const state = this.circuitStates[apiName];

    // Verificar se o circuito está aberto
    if (state === CircuitState.OPEN) {
      const timeSinceChange = Date.now() - this.lastStateChange[apiName];
      if (timeSinceChange > this.COOLDOWN_PERIOD) {
        this.logger.warn(`[Circuit Breaker] ${apiName} entrou em estado HALF-OPEN para teste.`);
        this.circuitStates[apiName] = CircuitState.HALF_OPEN;
      } else {
        throw new Error(`Circuito aberto para ${apiName}. Ignorando chamada.`);
      }
    }

    try {
      const result = await apiCall();
      
      // Se tiver sucesso no half-open ou closed, reseta as falhas
      if (this.circuitStates[apiName] === CircuitState.HALF_OPEN) {
        this.logger.log(`[Circuit Breaker] ${apiName} recuperado com sucesso. Circuito FECHADO.`);
      }
      this.circuitStates[apiName] = CircuitState.CLOSED;
      this.failureCounts[apiName] = 0;
      
      return result;
    } catch (error: any) {
      const wasHalfOpen = this.circuitStates[apiName] === CircuitState.HALF_OPEN;
      this.failureCounts[apiName]++;
      this.logger.warn(`[Circuit Breaker] Falha registrada na chamada para ${apiName}. Falhas acumuladas: ${this.failureCounts[apiName]}`);
      
      if (wasHalfOpen || this.failureCounts[apiName] >= this.FAILURE_THRESHOLD) {
        this.logger.error(`[Circuit Breaker] ${apiName} falhou no teste HALF-OPEN ou atingiu limite de falhas. Circuito ABERTO por 30s.`);
        this.circuitStates[apiName] = CircuitState.OPEN;
        this.lastStateChange[apiName] = Date.now();
      }
      
      throw error;
    }
  }

  // Simulação de Chamada AniList (GraphQL)
  private async fetchFromAniList(id: string, type: 'ANIME' | 'MANGA'): Promise<NormalizedMedia> {
    // Simulamos uma chamada HTTP com timeout e retry usando RxJS
    const obs$ = of({
      id: id,
      title: { romaji: 'Solo Leveling', english: 'Solo Leveling' },
      type: type === 'ANIME' ? 'ANIME' : 'MANGA',
      coverImage: { large: 'https://images.aniboxd.com/covers/sololeveling.jpg' },
      bannerImage: 'https://images.aniboxd.com/banners/sololeveling.jpg',
      description: 'Em um mundo onde caçadores lutam contra monstros...',
      staff: { nodes: [{ name: { full: 'Chugong' } }] },
      studios: { nodes: [{ name: 'A-1 Pictures' }] },
      genres: ['Action', 'Adventure', 'Fantasy'],
      seasonYear: 2024,
      status: 'FINISHED',
      episodes: 12,
      chapters: 200
    }).pipe(
      timeout({ each: this.TIMEOUT_LIMIT }),
      retry(2), // 2 tentativas extras se der timeout/erro
      map(data => this.normalizeAniList(data))
    );

    return firstValueFrom(obs$);
  }

  // Simulação de Chamada Jikan (REST - Fallback 1)
  private async fetchFromJikan(id: string, type: 'ANIME' | 'MANGA'): Promise<NormalizedMedia> {
    const obs$ = of({
      mal_id: parseInt(id),
      title: 'Solo Leveling (Jikan)',
      type: type === 'ANIME' ? 'TV' : 'Manga',
      images: { jpg: { large_image_url: 'https://images.aniboxd.com/covers/sololeveling_jikan.jpg' } },
      synopsis: 'Jikan fallback synopsis here...',
      authors: [{ name: 'Chugong' }],
      studios: [{ name: 'A-1 Pictures' }],
      genres: [{ name: 'Action' }],
      aired: { prop: { from: { year: 2024 } } },
      status: 'Finished Airing',
      episodes: 12,
      chapters: 200
    }).pipe(
      timeout({ each: this.TIMEOUT_LIMIT }),
      retry(1),
      map(data => this.normalizeJikan(data))
    );

    return firstValueFrom(obs$);
  }

  // Simulação de Chamada Kitsu (REST - Fallback 2)
  private async fetchFromKitsu(id: string, type: 'ANIME' | 'MANGA'): Promise<NormalizedMedia> {
    const obs$ = of({
      id: id,
      attributes: {
        canonicalTitle: 'Solo Leveling (Kitsu)',
        subtype: type === 'ANIME' ? 'tv' : 'manga',
        posterImage: { large: 'https://images.aniboxd.com/covers/sololeveling_kitsu.jpg' },
        coverImage: { large: 'https://images.aniboxd.com/banners/sololeveling_kitsu.jpg' },
        synopsis: 'Kitsu fallback synopsis here...',
        status: 'finished',
        episodeCount: 12,
        chapterCount: 200
      }
    }).pipe(
      timeout({ each: this.TIMEOUT_LIMIT }),
      map(data => this.normalizeKitsu(data))
    );

    return firstValueFrom(obs$);
  }

  // Normalizadores de Dados
  private normalizeAniList(data: any): NormalizedMedia {
    return {
      externalId: data.id,
      title: data.title.english || data.title.romaji,
      type: data.type,
      coverUrl: data.coverImage?.large || null,
      bannerUrl: data.bannerImage || null,
      synopsis: data.description || null,
      author: data.staff?.nodes?.[0]?.name?.full || 'Desconhecido',
      studio: data.studios?.nodes?.[0]?.name || 'Desconhecido',
      genres: data.genres || [],
      releaseYear: data.seasonYear || null,
      status: this.mapStatus(data.status),
      totalEpisodes: data.episodes || 0,
      totalChapters: data.chapters || 0
    };
  }

  private normalizeJikan(data: any): NormalizedMedia {
    const jikanType = data.type?.toUpperCase() || '';
    return {
      externalId: data.mal_id ? data.mal_id.toString() : '',
      title: data.title || 'Desconhecido',
      type: ['TV', 'MOVIE', 'OVA', 'SPECIAL', 'ONA', 'MUSIC'].includes(jikanType) ? 'ANIME' : 'MANGA',
      coverUrl: data.images?.jpg?.large_image_url || null,
      bannerUrl: null,
      synopsis: data.synopsis || null,
      author: data.authors?.[0]?.name || 'Desconhecido',
      studio: data.studios?.[0]?.name || 'Desconhecido',
      genres: data.genres?.map((g: any) => g.name) || [],
      releaseYear: data.aired?.prop?.from?.year || null,
      status: this.mapStatus(data.status),
      totalEpisodes: data.episodes || 0,
      totalChapters: data.chapters || 0
    };
  }

  private normalizeKitsu(data: any): NormalizedMedia {
    const attr = data?.attributes || {};
    const kitsuSubtype = attr.subtype?.toUpperCase() || '';
    return {
      externalId: data.id || '',
      title: attr.canonicalTitle || 'Desconhecido',
      type: ['TV', 'MOVIE', 'OVA', 'SPECIAL', 'ONA', 'MUSIC'].includes(kitsuSubtype) ? 'ANIME' : 'MANGA',
      coverUrl: attr.posterImage?.large || null,
      bannerUrl: attr.coverImage?.large || null,
      synopsis: attr.synopsis || null,
      author: 'Desconhecido',
      studio: 'Desconhecido',
      genres: [],
      releaseYear: null,
      status: this.mapStatus(attr.status),
      totalEpisodes: attr.episodeCount || 0,
      totalChapters: attr.chapterCount || 0
    };
  }

  private mapStatus(status: string): 'AIRING' | 'FINISHED' | 'UPCOMING' | 'HIATUS' | 'CANCELLED' {
    if (!status) return 'UPCOMING';
    const s = status.toUpperCase();
    if (s.includes('FINISHED') || s.includes('COMPLETED')) return 'FINISHED';
    if (s.includes('AIRING') || s.includes('CURRENT') || s.includes('RELEASING')) return 'AIRING';
    if (s.includes('HIATUS')) return 'HIATUS';
    if (s.includes('CANCELLED') || s.includes('CANCELED')) return 'CANCELLED';
    return 'UPCOMING';
  }

  // Métodos Utilitários do Cache (simulado)
  private getCache(key: string): NormalizedMedia | null {
    const item = this.redisCache.get(key);
    if (!item) return null;
    if (Date.now() > item.expiresAt) {
      this.redisCache.delete(key);
      return null;
    }
    return item.data;
  }

  private setCache(key: string, data: NormalizedMedia, ttlSeconds: number): void {
    const expiresAt = Date.now() + ttlSeconds * 1000;
    this.redisCache.set(key, { data, expiresAt });
  }
}
