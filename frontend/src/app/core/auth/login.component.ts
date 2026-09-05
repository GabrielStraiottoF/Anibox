import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize } from 'rxjs/operators';
import { AuthService } from './auth.service';

@Component({
  standalone: true,
  selector: 'app-login',
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <main class="login-page">
      <section class="login-card" aria-labelledby="login-title">
        <div class="brand">
          <h1 id="login-title">Aniboxd</h1>
          <p>Entre na sua conta</p>
        </div>

        <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
          <label for="email">E-mail</label>
          <input
            id="email"
            type="email"
            formControlName="email"
            autocomplete="email"
            placeholder="seu@email.com"
          />
          <small *ngIf="form.controls.email.touched && form.controls.email.invalid">
            Informe um e-mail válido.
          </small>

          <label for="password">Senha</label>
          <input
            id="password"
            type="password"
            formControlName="password"
            autocomplete="current-password"
            placeholder="Sua senha"
          />
          <small *ngIf="form.controls.password.touched && form.controls.password.invalid">
            A senha é obrigatória.
          </small>

          <p *ngIf="errorMessage" class="error" role="alert">{{ errorMessage }}</p>

          <button type="submit" [disabled]="form.invalid || loading">
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
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  loading = false;
  errorMessage = '';

  submit(): void {
    if (this.form.invalid || this.loading) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading = true;
    this.errorMessage = '';

    this.authService
      .login(this.form.getRawValue())
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
