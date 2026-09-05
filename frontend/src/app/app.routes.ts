import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'home' },
  {
    path: 'auth/login',
    loadComponent: () => import('./core/auth/login.component').then((module) => module.LoginComponent),
  },
  {
    path: 'auth/register',
    loadComponent: () => import('./core/auth/register.component').then((module) => module.RegisterComponent),
  },
  {
    path: 'home',
    loadComponent: () => import('./home/home.component').then((module) => module.HomeComponent),
  },
  { path: '**', redirectTo: 'home' },
];
