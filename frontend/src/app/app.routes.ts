import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'auth/login',
  },
  {
    path: 'auth/login',
    loadComponent: () =>
      import('./core/auth/login.component').then((module) => module.LoginComponent),
  },
  {
    path: '**',
    redirectTo: 'auth/login',
  },
];
