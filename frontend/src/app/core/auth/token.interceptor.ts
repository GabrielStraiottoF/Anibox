import {
  HttpErrorResponse,
  HttpEvent,
  HttpHandlerFn,
  HttpInterceptorFn,
  HttpRequest,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { Observable, BehaviorSubject, throwError } from 'rxjs';
import { catchError, filter, switchMap, take } from 'rxjs/operators';
import { AuthService } from './auth.service';

let isRefreshing = false;
let refreshTokenSubject = new BehaviorSubject<string | null>(null);

export const tokenInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
): Observable<HttpEvent<unknown>> => {
  const authService = inject(AuthService);
  const token = authService.getAccessToken();

  // Authentication endpoints are public and must not trigger the refresh flow.
  const isAuthRequest = req.url.includes('/api/v1/auth/');
  const authReq = token && !isAuthRequest ? injectToken(req, token) : req;
  const requestWithCredentials = authReq.clone({ withCredentials: true });

  return next(requestWithCredentials).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || error.status !== 401 || isAuthRequest) {
        return throwError(() => error);
      }

      return handle401Error(requestWithCredentials, next, authService);
    }),
  );
};

function injectToken(req: HttpRequest<unknown>, token: string): HttpRequest<unknown> {
  return req.clone({
    setHeaders: {
      Authorization: `Bearer ${token}`,
    },
  });
}

function handle401Error(
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
  authService: AuthService,
): Observable<HttpEvent<unknown>> {
  if (!isRefreshing) {
    isRefreshing = true;
    refreshTokenSubject.next(null);

    return authService.rotateTokens().pipe(
      switchMap(({ accessToken }) => {
        isRefreshing = false;
        refreshTokenSubject.next(accessToken);
        return next(injectToken(req, accessToken));
      }),
      catchError((error: unknown) => {
        isRefreshing = false;
        refreshTokenSubject.next(null);
        authService.logout();
        return throwError(() => error);
      }),
    );
  }

  return refreshTokenSubject.pipe(
    filter((token): token is string => token !== null),
    take(1),
    switchMap((token) => next(injectToken(req, token))),
  );
}
