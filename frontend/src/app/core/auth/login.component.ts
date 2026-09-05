import { Component, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize } from 'rxjs/operators';
import { AuthService } from './auth.service';

@Component({
  standalone: true,
  selector: 'app-login',
  template: `
    <main class="login-page">
      <section class="login-card" aria-labelledby="login-title">
        <div class="brand">
          <h1 id="login-title">Aniboxd</h1>
          <p>Entre na sua conta</p>
        </div>

        <form (submit)="submit(emailInput.value, passwordInput.value, $event)" novalidate>
          <label for="email">E-mail</label>
          <input
            #emailInput
            id="email"
            type="email"
            autocomplete="email"
            placeholder="seu@email.com"
            required
          />
          @if (emailTouched && !isEmailValid(emailInput.value)) {
            <small>Informe um e-mail válido.</small>
          }

          <label for="password">Senha</label>
          <input
            #passwordInput
            id="password"
            type="password"
            autocomplete="current-password"
            placeholder="Sua senha"
            required
          />
          @if (passwordTouched && !passwordInput.value.trim()) {
            <small>A senha é obrigatória.</small>
          }

          @if (errorMessage) {
            <p class="error" role="alert">{{ errorMessage }}</p>
          }

          <button
            type="submit"
            [disabled]="loading || !isEmailValid(emailInput.value) || !passwordInput.value.trim()"
          >
            {{ loading ? 'Entrando...' : 'Entrar' }}
          </button>
        </form>
      </section>
    </main>
  `,
  styles: [
    `
      :host { display: block; min-height: 100vh; }
      .login-page {
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 2rem;
        box-sizing: border-box;
      }
      .login-card {
        width: min(100%, 420px);
        padding: 2rem;
        border: 1px solid #ddd;
        border-radius: 16px;
        background: #fff;
        box-sizing: border-box;
      }
      .brand { margin-bottom: 1.5rem; }
      .brand h1 { margin: 0; }
      .brand p { margin: .5rem 0 0; }
      form { display: grid; gap: .75rem; }
      label { font-weight: 600; }
      input {
        width: 100%;
        box-sizing: border-box;
        padding: .8rem .9rem;
        border: 1px solid #bbb;
        border-radius: 8px;
        font: inherit;
      }
      small, .error { color: #b42318; }
      .error { margin: .25rem 0; }
      button {
        margin-top: .5rem;
        padding: .85rem 1rem;
        border: 0;
        border-radius: 8px;
        font: inherit;
        font-weight: 700;
        cursor: pointer;
      }
      button:disabled { cursor: not-allowed; opacity: .6; }
    `,
  ],
})
export class LoginComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  loading = false;
  emailTouched = false;
  passwordTouched = false;
  errorMessage = '';

  isEmailValid(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  }

  submit(email: string, password: string, event: SubmitEvent): void {
    event.preventDefault();
    this.emailTouched = true;
    this.passwordTouched = true;

    const normalizedEmail = email.trim();
    const normalizedPassword = password.trim();

    if (!this.isEmailValid(normalizedEmail) || !normalizedPassword || this.loading) {
      return;
    }

    this.loading = true;
    this.errorMessage = '';

    this.authService
      .login({ email: normalizedEmail, password: normalizedPassword })
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: () => {
          const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') || '/';
          void this.router.navigateByUrl(returnUrl);
        },
        error: () => {
          this.errorMessage = 'Não foi possível realizar o login. Verifique suas credenciais.';
        },
      });
  }
}
