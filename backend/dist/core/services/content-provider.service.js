"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var ContentProviderService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContentProviderService = void 0;
const common_1 = require("@nestjs/common");
const rxjs_1 = require("rxjs");
const operators_1 = require("rxjs/operators");
var CircuitState;
(function (CircuitState) {
    CircuitState[CircuitState["CLOSED"] = 0] = "CLOSED";
    CircuitState[CircuitState["OPEN"] = 1] = "OPEN";
    CircuitState[CircuitState["HALF_OPEN"] = 2] = "HALF_OPEN";
})(CircuitState || (CircuitState = {}));
let ContentProviderService = ContentProviderService_1 = class ContentProviderService {
    constructor() {
        this.logger = new common_1.Logger(ContentProviderService_1.name);
        this.redisCache = new Map();
        this.circuitStates = {
            anilist: CircuitState.CLOSED,
            jikan: CircuitState.CLOSED,
            kitsu: CircuitState.CLOSED
        };
        this.failureCounts = { anilist: 0, jikan: 0, kitsu: 0 };
        this.lastStateChange = { anilist: Date.now(), jikan: Date.now(), kitsu: Date.now() };
        this.FAILURE_THRESHOLD = 3;
        this.COOLDOWN_PERIOD = 30000;
        this.TIMEOUT_LIMIT = 3000;
    }
    async getMediaDetails(externalId, type) {
        const cacheKey = `media:${type.toLowerCase()}:${externalId}`;
        const cached = this.getCache(cacheKey);
        if (cached) {
            this.logger.debug(`[Cache Hit] Retornando mídia cacheada para chave: ${cacheKey}`);
            return cached;
        }
        this.logger.log(`[Cache Miss] Buscando mídia externa: id=${externalId}, tipo=${type}`);
        try {
            const data = await this.executeWithCircuitBreaker('anilist', () => this.fetchFromAniList(externalId, type));
            this.setCache(cacheKey, data, 3600);
            return data;
        }
        catch (error) {
            this.logger.warn(`[Failover] AniList falhou. Tentando Jikan API... Erro: ${error.message}`);
            try {
                const data = await this.executeWithCircuitBreaker('jikan', () => this.fetchFromJikan(externalId, type));
                this.setCache(cacheKey, data, 1800);
                return data;
            }
            catch (jikanError) {
                this.logger.warn(`[Failover] Jikan falhou. Tentando Kitsu API... Erro: ${jikanError.message}`);
                try {
                    const data = await this.executeWithCircuitBreaker('kitsu', () => this.fetchFromKitsu(externalId, type));
                    this.setCache(cacheKey, data, 1800);
                    return data;
                }
                catch (kitsuError) {
                    this.logger.error(`[Fatal] Todas as APIs de conteúdo falharam para a mídia ID: ${externalId}`);
                    throw new common_1.HttpException('Não foi possível obter os dados da obra no momento devido à indisponibilidade nos provedores externos.', common_1.HttpStatus.SERVICE_UNAVAILABLE);
                }
            }
        }
    }
    async executeWithCircuitBreaker(apiName, apiCall) {
        const state = this.circuitStates[apiName];
        if (state === CircuitState.OPEN) {
            const timeSinceChange = Date.now() - this.lastStateChange[apiName];
            if (timeSinceChange > this.COOLDOWN_PERIOD) {
                this.logger.warn(`[Circuit Breaker] ${apiName} entrou em estado HALF-OPEN para teste.`);
                this.circuitStates[apiName] = CircuitState.HALF_OPEN;
            }
            else {
                throw new Error(`Circuito aberto para ${apiName}. Ignorando chamada.`);
            }
        }
        try {
            const result = await apiCall();
            if (this.circuitStates[apiName] === CircuitState.HALF_OPEN) {
                this.logger.log(`[Circuit Breaker] ${apiName} recuperado com sucesso. Circuito FECHADO.`);
            }
            this.circuitStates[apiName] = CircuitState.CLOSED;
            this.failureCounts[apiName] = 0;
            return result;
        }
        catch (error) {
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
    async fetchFromAniList(id, type) {
        const obs$ = (0, rxjs_1.of)({
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
        }).pipe((0, operators_1.timeout)({ each: this.TIMEOUT_LIMIT }), (0, operators_1.retry)(2), (0, operators_1.map)(data => this.normalizeAniList(data)));
        return (0, rxjs_1.firstValueFrom)(obs$);
    }
    async fetchFromJikan(id, type) {
        const obs$ = (0, rxjs_1.of)({
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
        }).pipe((0, operators_1.timeout)({ each: this.TIMEOUT_LIMIT }), (0, operators_1.retry)(1), (0, operators_1.map)(data => this.normalizeJikan(data)));
        return (0, rxjs_1.firstValueFrom)(obs$);
    }
    async fetchFromKitsu(id, type) {
        const obs$ = (0, rxjs_1.of)({
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
        }).pipe((0, operators_1.timeout)({ each: this.TIMEOUT_LIMIT }), (0, operators_1.map)(data => this.normalizeKitsu(data)));
        return (0, rxjs_1.firstValueFrom)(obs$);
    }
    normalizeAniList(data) {
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
    normalizeJikan(data) {
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
            genres: data.genres?.map((g) => g.name) || [],
            releaseYear: data.aired?.prop?.from?.year || null,
            status: this.mapStatus(data.status),
            totalEpisodes: data.episodes || 0,
            totalChapters: data.chapters || 0
        };
    }
    normalizeKitsu(data) {
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
    mapStatus(status) {
        if (!status)
            return 'UPCOMING';
        const s = status.toUpperCase();
        if (s.includes('FINISHED') || s.includes('COMPLETED'))
            return 'FINISHED';
        if (s.includes('AIRING') || s.includes('CURRENT') || s.includes('RELEASING'))
            return 'AIRING';
        if (s.includes('HIATUS'))
            return 'HIATUS';
        if (s.includes('CANCELLED') || s.includes('CANCELED'))
            return 'CANCELLED';
        return 'UPCOMING';
    }
    getCache(key) {
        const item = this.redisCache.get(key);
        if (!item)
            return null;
        if (Date.now() > item.expiresAt) {
            this.redisCache.delete(key);
            return null;
        }
        return item.data;
    }
    setCache(key, data, ttlSeconds) {
        const expiresAt = Date.now() + ttlSeconds * 1000;
        this.redisCache.set(key, { data, expiresAt });
    }
};
exports.ContentProviderService = ContentProviderService;
exports.ContentProviderService = ContentProviderService = ContentProviderService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], ContentProviderService);
//# sourceMappingURL=content-provider.service.js.map