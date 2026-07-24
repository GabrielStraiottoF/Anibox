import { HttpInterceptorFn, HttpRequest, HttpHandlerFn, HttpEvent, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Observable, throwError, BehaviorSubject } from 'rxjs';
import { catchError, switchMap, filter, take } from 'rxjs/operators';
import { AuthService } from './auth.service';

let isRefreshing = false;
let refreshTokenSubject = new BehaviorSubject<string | null>(null);

export const tokenInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn
): Observable<HttpEvent<unknown>> => {
  const authService = inject(AuthService);
  const token = authService.getAccessToken();

  // Clonar requisição para injetar o AccessToken (se existir e se não for rota de auth externa)
  let authReq = req;
  if (token && !req.url.includes('api.anilist.co') && !req.url.includes('kitsu.io')) {
    authReq = injectToken(req, token);
  }

  return next(authReq).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        // Se a própria requisição de refresh falhar, força logout
        if (req.url.includes('/auth/refresh')) {
          authService.logout();
          return throwError(() => error);
        }

        return handle401Error(authReq, next, authService);
      }
      return throwError(() => error);
    })
  );
};

/**
 * Auxiliar para injetar cabeçalho de autorização
 */
function injectToken(req: HttpRequest<unknown>, token: string): HttpRequest<unknown> {
  return req.clone({
    setHeaders: {
      Authorization: `Bearer ${token}`
    }
  });
}

/**
 * Gerencia a fila de requisições travadas enquanto rotaciona o Refresh Token
 */
function handle401Error(
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
  authService: AuthService
): Observable<HttpEvent<unknown>> {
  if (!isRefreshing) {
    isRefreshing = true;
    refreshTokenSubject.next(null);

    return authService.rotateTokens().pipe(
      switchMap((newTokens: any) => {
        isRefreshing = false;
        const newAccessToken = newTokens.accessToken;
        refreshTokenSubject.next(newAccessToken);
        return next(injectToken(req, newAccessToken));
      }),
      catchError((err) => {
        isRefreshing = false;
        authService.logout();
        refreshTokenSubject.error(err);
        refreshTokenSubject = new BehaviorSubject<string | null>(null);
        return throwError(() => err);
      })
    );
  } else {
    // Se já estiver rotacionando, aguarda o sinal do novo token para liberar a requisição na fila
    return refreshTokenSubject.pipe(
      filter(token => token !== null),
      take(1),
      switchMap((token) => next(injectToken(req, token!)))
    );
  }
}
