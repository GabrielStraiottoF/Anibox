import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { finalize } from 'rxjs/operators';
import { AuthService } from './auth.service';

@Component({
  standalone: true,
  selector: 'app-register',
  template: `
    <main class="register-page">
      <section class="register-card" aria-labelledby="register-title">
        <div class="brand">
          <h1 id="register-title">Criar conta</h1>
          <p>Comece sua coleção no Aniboxd.</p>
        </div>

        <form (submit)="submit(email.value, username.value, password.value, confirm.value, $event)" novalidate>
          <label for="email">E-mail</label>
          <input #email id="email" type="email" autocomplete="email" required />

          <label for="username">Username</label>
          <input #username id="username" autocomplete="username" required maxlength="32" />

          <label for="password">Senha</label>
          <input #password id="password" type="password" autocomplete="new-password" required minlength="8" />

          <label for="confirm">Confirmar senha</label>
          <input #confirm id="confirm" type="password" autocomplete="new-password" required />

          @if (errorMessage) {
            <p class="error" role="alert">{{ errorMessage }}</p>
          }

          <button type="submit" [disabled]="loading">
            {{ loading ? 'Criando...' : 'Criar conta' }}
          </button>
          <button type="button" class="secondary" (click)="goToLogin()">Voltar para login</button>
        </form>
      </section>
    </main>
  `,
  styles: [`
    :host { display: block; min-height: 100vh; }
    .register-page { min-height: 100vh; display: grid; place-items: center; padding: 2rem; box-sizing: border-box; }
    .register-card { width: min(100%, 460px); padding: 2rem; border: 1px solid #ddd; border-radius: 16px; background: #fff; box-sizing: border-box; }
    .brand { margin-bottom: 1.5rem; }
    .brand h1 { margin: 0; }
    .brand p { margin: .5rem 0 0; }
    form { display: grid; gap: .75rem; }
    label { font-weight: 600; }
    input { width: 100%; box-sizing: border-box; padding: .8rem .9rem; border: 1px solid #bbb; border-radius: 8px; font: inherit; }
    .error { margin: .25rem 0; color: #b42318; }
    button { margin-top: .5rem; padding: .85rem 1rem; border: 0; border-radius: 8px; font: inherit; font-weight: 700; cursor: pointer; }
    .secondary { background: transparent; border: 1px solid #ccc; }
    button:disabled { cursor: not-allowed; opacity: .6; }
  `],
})
export class RegisterComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  loading = false;
  errorMessage = '';

  submit(email: string, username: string, password: string, confirm: string, event: SubmitEvent): void {
    event.preventDefault();
    this.errorMessage = '';
    const normalizedEmail = email.trim();
    const normalizedUsername = username.trim();
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) { this.errorMessage = 'Informe um e-mail válido.'; return; }
    if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(normalizedUsername)) { this.errorMessage = 'Username inválido.'; return; }
    if (password.length < 8) { this.errorMessage = 'A senha deve ter pelo menos 8 caracteres.'; return; }
    if (password !== confirm) { this.errorMessage = 'As senhas não coincidem.'; return; }
    if (this.loading) return;

    this.loading = true;
    this.authService.register({ email: normalizedEmail, username: normalizedUsername, password })
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: () => void this.router.navigate(['/home']),
        error: () => { this.errorMessage = 'Não foi possível criar a conta.'; },
      });
  }

  goToLogin(): void { void this.router.navigate(['/auth/login']); }
}
