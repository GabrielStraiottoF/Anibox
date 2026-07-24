import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from '../auth/auth.service';

/**
 * Guard funcional do Angular 18+ baseado em Signals para proteção de rotas
 */
export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // Utiliza o Signal reativo exposto pelo AuthService
  if (authService.isAuthenticated()) {
    return true;
  }

  // Redireciona o usuário para a página de login se não autenticado,
  // salvando a URL que ele estava tentando acessar originalmente.
  return router.createUrlTree(['/auth/login'], {
    queryParams: { returnUrl: state.url }
  });
};
