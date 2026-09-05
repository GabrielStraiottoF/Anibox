import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { API_URL } from '../config/runtime-config';

interface AuthResponse {
  accessToken: string;
  user: {
    id: string;
    username: string;
    email: string;
    role: string;
  };
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly currentUserSignal = signal<AuthResponse['user'] | null>(null);
  private readonly accessTokenSignal = signal<string | null>(null);
  readonly currentUser = computed(() => this.currentUserSignal());
  readonly isAuthenticated = computed(() => !!this.accessTokenSignal());
  private readonly API_URL = `${API_URL}/auth`;

  constructor() {
    if (typeof window !== 'undefined') {
      const savedUser = localStorage.getItem('aniboxd_user');
      const savedToken = localStorage.getItem('aniboxd_access_token');
      if (savedUser && savedToken) {
        try { this.currentUserSignal.set(JSON.parse(savedUser)); this.accessTokenSignal.set(savedToken); } catch { this.clearSession(); }
      }
    }
  }

  getAccessToken(): string | null { return this.accessTokenSignal(); }

  login(credentials: { email: string; password: string }): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.API_URL}/login`, credentials, { withCredentials: true }).pipe(tap((response) => this.saveSession(response.accessToken, response.user)));
  }

  register(credentials: { email: string; username: string; password: string }): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.API_URL}/register`, credentials, { withCredentials: true }).pipe(tap((response) => this.saveSession(response.accessToken, response.user)));
  }

  logout(): void {
    this.http.post(`${this.API_URL}/logout`, {}, { withCredentials: true }).subscribe({ complete: () => this.finishLogout(), error: () => this.finishLogout() });
  }

  rotateTokens(): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.API_URL}/refresh`, {}, { withCredentials: true }).pipe(tap((response) => this.saveSession(response.accessToken, response.user)));
  }

  private finishLogout(): void { this.clearSession(); void this.router.navigate(['/auth/login']); }

  private saveSession(accessToken: string, user: AuthResponse['user']): void {
    this.accessTokenSignal.set(accessToken); this.currentUserSignal.set(user);
    if (typeof window !== 'undefined') { localStorage.setItem('aniboxd_access_token', accessToken); localStorage.setItem('aniboxd_user', JSON.stringify(user)); }
  }

  private clearSession(): void {
    this.accessTokenSignal.set(null); this.currentUserSignal.set(null);
    if (typeof window !== 'undefined') { localStorage.removeItem('aniboxd_access_token'); localStorage.removeItem('aniboxd_user'); }
  }
}
