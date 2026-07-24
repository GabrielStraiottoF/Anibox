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
export declare class ContentProviderService {
    private readonly logger;
    private redisCache;
    private circuitStates;
    private failureCounts;
    private lastStateChange;
    private readonly FAILURE_THRESHOLD;
    private readonly COOLDOWN_PERIOD;
    private readonly TIMEOUT_LIMIT;
    constructor();
    getMediaDetails(externalId: string, type: 'ANIME' | 'MANGA'): Promise<NormalizedMedia>;
    private executeWithCircuitBreaker;
    private fetchFromAniList;
    private fetchFromJikan;
    private fetchFromKitsu;
    private normalizeAniList;
    private normalizeJikan;
    private normalizeKitsu;
    private mapStatus;
    private getCache;
    private setCache;
}
