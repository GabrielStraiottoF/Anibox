import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';

interface AuthResponse {
  accessToken: string;
  user: {
    id: string;
    username: string;
    email: string;
    role: string;
  };
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  
  // Usando Angular Signals para gerenciar estado de autenticação reativo global
  private currentUserSignal = signal<any | null>(null);
  private accessTokenSignal = signal<string | null>(null);

  // Computeds expostos publicamente (leitura reativa eficiente)
  currentUser = computed(() => this.currentUserSignal());
  isAuthenticated = computed(() => !!this.accessTokenSignal());

  private readonly API_URL = '/api/v1/auth';

  constructor() {
    // Restaurar estado inicial na inicialização (somente no lado do cliente / browser)
    if (typeof window !== 'undefined') {
      const savedUser = localStorage.getItem('aniboxd_user');
      const savedToken = localStorage.getItem('aniboxd_access_token');
      if (savedUser && savedToken) {
        try {
          this.currentUserSignal.set(JSON.parse(savedUser));
          this.accessTokenSignal.set(savedToken);
        } catch (e) {
          this.clearSession();
        }
      }
    }
  }

  getAccessToken(): string | null {
    return this.accessTokenSignal();
  }

  login(credentials: { email: string; password: string }): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.API_URL}/login`, credentials).pipe(
      tap((response) => {
        this.saveSession(response.accessToken, response.user);
      })
    );
  }

  logout(): void {
    this.clearSession();
    this.router.navigate(['/auth/login']);
  }

  /**
   * Envia requisição para rotacionar os tokens (RefreshToken vai via cookie HttpOnly configurado pelo backend)
   */
  rotateTokens(): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.API_URL}/refresh`, {}).pipe(
      tap((response) => {
        this.saveSession(response.accessToken, response.user);
      })
    );
  }

  private saveSession(accessToken: string, user: any): void {
    this.accessTokenSignal.set(accessToken);
    this.currentUserSignal.set(user);
    if (typeof window !== 'undefined') {
      localStorage.setItem('aniboxd_access_token', accessToken);
      localStorage.setItem('aniboxd_user', JSON.stringify(user));
    }
  }

  private clearSession(): void {
    this.accessTokenSignal.set(null);
    this.currentUserSignal.set(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('aniboxd_access_token');
      localStorage.removeItem('aniboxd_user');
    }
  }
}
