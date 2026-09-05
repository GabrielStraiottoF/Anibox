import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../core/auth/auth.service';

@Component({
  standalone: true,
  selector: 'app-home',
  template: `
    <main class="home-page">
      <section class="home-card" aria-labelledby="home-title">
        <p class="eyebrow">Aniboxd</p>
        <h1 id="home-title">Aplicação pronta para receber as APIs</h1>
        <p class="description">
          A interface e a infraestrutura estão funcionando. A integração com as APIs de
          catálogo e autenticação pode ser conectada posteriormente pelas variáveis de ambiente.
        </p>

        @if (authService.currentUser(); as user) {
          <p class="session">Sessão local: <strong>{{ user.username || user.email }}</strong></p>
          <button type="button" (click)="logout()">Sair</button>
        } @else {
          <p class="session">Nenhuma sessão autenticada.</p>
          <button type="button" (click)="goToLogin()">Ir para login</button>
        }
      </section>
    </main>
  `,
  styles: [
    `
      :host {
        display: block;
        min-height: 100vh;
      }

      .home-page {
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 2rem;
      }

      .home-card {
        width: min(100%, 720px);
        padding: 2.5rem;
        border: 1px solid #2a2a2a;
        border-radius: 20px;
        background: #171717;
        box-shadow: 0 16px 40px rgba(0, 0, 0, 0.28);
      }

      .eyebrow {
        margin: 0 0 0.5rem;
        font-size: 0.85rem;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        opacity: 0.7;
      }

      h1 {
        margin: 0;
        font-size: clamp(2rem, 5vw, 3.2rem);
        line-height: 1.05;
      }

      .description {
        margin: 1rem 0 0;
        max-width: 60ch;
        line-height: 1.6;
        opacity: 0.85;
      }

      .session {
        margin: 1.5rem 0 0;
        line-height: 1.5;
      }

      button {
        margin-top: 1.25rem;
        min-width: 140px;
        padding: 0.8rem 1rem;
        border: 0;
        border-radius: 10px;
        background: #f0f0f0;
        color: #111;
        font: inherit;
        font-weight: 700;
        cursor: pointer;
      }
    `,
  ],
})
export class HomeComponent {
  readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  logout(): void {
    this.authService.logout();
  }

  goToLogin(): void {
    void this.router.navigate(['/auth/login']);
  }
}
