import { Component, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { finalize } from 'rxjs/operators';
import { API_URL } from '../core/config/runtime-config';
import { AuthService } from '../core/auth/auth.service';

interface SearchMedia {
  externalId: string;
  title: string;
  type: string;
  coverUrl: string | null;
  synopsis: string | null;
  releaseYear: number | null;
  status: string;
  provider: string;
}

interface SearchResponse {
  items: SearchMedia[];
  page: number;
  perPage: number;
  hasNextPage: boolean;
  provider: string;
}

@Component({
  standalone: true,
  selector: 'app-home',
  template: `
    <main class="home-page">
      <header class="topbar">
        <a class="brand" routerLink="/home">Aniboxd</a>
        <nav aria-label="Navegação principal">
          @if (authService.currentUser(); as user) {
            <span class="user">{{ user.username }}</span>
            <button type="button" class="ghost" (click)="logout()">Sair</button>
          } @else {
            <button type="button" class="ghost" (click)="goToLogin()">Entrar</button>
            <button type="button" class="primary small" (click)="goToRegister()">Criar conta</button>
          }
        </nav>
      </header>

      <section class="hero" aria-labelledby="home-title">
        <p class="eyebrow">Sua coleção de anime e mangá</p>
        <h1 id="home-title">Descubra, acompanhe e organize o que você assiste e lê.</h1>
        <p class="description">Pesquise no catálogo, acompanhe sua biblioteca e use sua conta para registrar sua coleção.</p>

        <form class="search" (submit)="search(query.value, type.value, $event)">
          <input #query type="search" placeholder="Busque por título..." aria-label="Buscar por título" />
          <select #type aria-label="Tipo de mídia">
            <option value="ANIME">Anime</option>
            <option value="MANGA">Mangá</option>
          </select>
          <button class="primary" type="submit" [disabled]="loading || !query.value.trim()">
            {{ loading ? 'Buscando...' : 'Buscar' }}
          </button>
        </form>

        @if (errorMessage) {
          <p class="error" role="alert">{{ errorMessage }}</p>
        }
      </section>

      <section class="results" aria-labelledby="results-title">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Catálogo</p>
            <h2 id="results-title">{{ results.length ? 'Resultados' : 'Comece uma busca' }}</h2>
          </div>
          @if (hasNextPage) {
            <button type="button" class="ghost" (click)="nextPage()" [disabled]="loading">Próxima página</button>
          }
        </div>

        @if (loading && !results.length) {
          <div class="state">Carregando resultados...</div>
        } @else if (!loading && !results.length && !hasSearched) {
          <div class="state">Pesquise por uma obra para começar.</div>
        } @else if (!loading && !results.length && hasSearched) {
          <div class="state">Nenhuma obra encontrada.</div>
        } @else {
          <div class="grid">
            @for (media of results; track media.externalId + media.provider) {
              <article class="media-card">
                @if (media.coverUrl) {
                  <img [src]="media.coverUrl" [alt]="'Capa de ' + media.title" loading="lazy" />
                } @else {
                  <div class="cover-fallback" aria-hidden="true">Sem capa</div>
                }
                <div class="media-body">
                  <p class="meta">{{ media.type === 'ANIME' ? 'Anime' : 'Mangá' }} · {{ media.releaseYear || 'Ano desconhecido' }}</p>
                  <h3>{{ media.title }}</h3>
                  <p class="synopsis">{{ media.synopsis || 'Sinopse indisponível.' }}</p>
                  <span class="status">{{ statusLabel(media.status) }}</span>
                </div>
              </article>
            }
          </div>
        }
      </section>
    </main>
  `,
  styles: [
    `
      :host { display: block; min-height: 100vh; }
      .home-page { min-height: 100vh; padding-bottom: 4rem; background: #0d0d0d; color: #f5f5f5; }
      .topbar { position: sticky; top: 0; z-index: 10; display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 1rem max(1rem, 4vw); border-bottom: 1px solid #292929; background: rgba(13, 13, 13, .94); backdrop-filter: blur(10px); }
      .brand { color: inherit; text-decoration: none; font-size: 1.25rem; font-weight: 800; }
      nav { display: flex; align-items: center; gap: .5rem; }
      .user { margin-right: .35rem; opacity: .8; }
      .hero, .results { width: min(1180px, calc(100% - 2rem)); margin-inline: auto; }
      .hero { padding: clamp(3.5rem, 10vw, 7rem) 0 2.5rem; }
      .hero h1 { max-width: 900px; margin: 0; font-size: clamp(2.4rem, 6vw, 5rem); line-height: 1.02; letter-spacing: -.03em; }
      .eyebrow { margin: 0 0 .65rem; font-size: .78rem; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; opacity: .62; }
      .description { max-width: 720px; margin: 1.1rem 0 0; font-size: 1.06rem; line-height: 1.65; opacity: .78; }
      .search { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: .6rem; margin-top: 2rem; max-width: 820px; }
      input, select { min-height: 48px; box-sizing: border-box; border: 1px solid #3a3a3a; border-radius: 10px; background: #171717; color: #f5f5f5; padding: .75rem .9rem; font: inherit; }
      button { border: 0; border-radius: 10px; padding: .75rem 1rem; font: inherit; font-weight: 750; cursor: pointer; }
      button:disabled { opacity: .55; cursor: not-allowed; }
      .primary { background: #f1f1f1; color: #111; }
      .small { padding-inline: .85rem; }
      .ghost { background: transparent; color: inherit; border: 1px solid #383838; }
      .error { margin-top: 1rem; color: #ff8c8c; }
      .results { padding-top: 1.5rem; }
      .section-heading { display: flex; align-items: end; justify-content: space-between; gap: 1rem; margin-bottom: 1.25rem; }
      .section-heading h2 { margin: 0; font-size: 1.9rem; }
      .state { padding: 3rem 1rem; border: 1px dashed #333; border-radius: 14px; text-align: center; opacity: .68; }
      .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 1rem; }
      .media-card { overflow: hidden; border: 1px solid #2a2a2a; border-radius: 16px; background: #161616; }
      .media-card img, .cover-fallback { display: block; width: 100%; aspect-ratio: 2 / 3; object-fit: cover; background: #222; }
      .cover-fallback { display: grid; place-items: center; color: #888; }
      .media-body { padding: 1rem; }
      .meta { margin: 0 0 .45rem; font-size: .78rem; opacity: .58; }
      h3 { margin: 0; font-size: 1.15rem; line-height: 1.25; }
      .synopsis { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 4; overflow: hidden; margin: .7rem 0 .9rem; line-height: 1.5; opacity: .72; }
      .status { display: inline-flex; padding: .28rem .55rem; border-radius: 999px; background: #252525; font-size: .75rem; }
      @media (max-width: 700px) {
        .search { grid-template-columns: 1fr; }
        .topbar { align-items: flex-start; }
        .user { display: none; }
      }
    `,
  ],
})
export class HomeComponent {
  readonly authService = inject(AuthService);
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  results: SearchMedia[] = [];
  loading = false;
  hasNextPage = false;
  hasSearched = false;
  page = 1;
  queryText = '';
  mediaType = 'ANIME';
  errorMessage = '';

  search(query: string, type: string, event: SubmitEvent): void {
    event.preventDefault();
    const normalized = query.trim();
    if (!normalized || this.loading) return;
    this.queryText = normalized;
    this.mediaType = type === 'MANGA' ? 'MANGA' : 'ANIME';
    this.page = 1;
    this.loadResults(true);
  }

  nextPage(): void {
    if (this.loading || !this.hasNextPage || !this.queryText) return;
    this.page += 1;
    this.loadResults(false);
  }

  statusLabel(status: string): string {
    const labels: Record<string, string> = {
      AIRING: 'Em lançamento',
      FINISHED: 'Finalizado',
      UPCOMING: 'Em breve',
      HIATUS: 'Hiato',
      CANCELLED: 'Cancelado',
    };
    return labels[status] || status;
  }

  logout(): void { this.authService.logout(); }
  goToLogin(): void { void this.router.navigate(['/auth/login']); }
  goToRegister(): void { void this.router.navigate(['/auth/register']); }

  private loadResults(reset: boolean): void {
    this.loading = true;
    this.hasSearched = true;
    this.errorMessage = '';
    const url = `${API_URL}/media/search?q=${encodeURIComponent(this.queryText)}&type=${this.mediaType}&page=${this.page}&perPage=12&provider=anilist`;
    this.http.get<SearchResponse>(url)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (response) => {
          this.results = reset ? response.items : [...this.results, ...response.items];
          this.hasNextPage = response.hasNextPage;
        },
        error: () => {
          this.errorMessage = 'Não foi possível consultar o catálogo agora.';
          if (reset) this.results = [];
          this.hasNextPage = false;
        },
      });
  }
}
