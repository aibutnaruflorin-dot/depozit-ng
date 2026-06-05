import { Routes } from '@angular/router';
import { authGuard, adminGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: '/app/catalog', pathMatch: 'full' },
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login/login.component').then(m => m.LoginComponent)
  },
  {
    path: 'app',
    loadComponent: () => import('./features/layout/layout.component').then(m => m.LayoutComponent),
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'catalog', pathMatch: 'full' },
      { path: 'catalog',     loadComponent: () => import('./features/catalog/catalog.component').then(m => m.CatalogComponent) },
      { path: 'new-order',   loadComponent: () => import('./features/new-order/new-order.component').then(m => m.NewOrderComponent) },
      { path: 'history-me',  loadComponent: () => import('./features/history/history.component').then(m => m.HistoryComponent) },
      { path: 'history-all', loadComponent: () => import('./features/history-all/history-all.component').then(m => m.HistoryAllComponent), canActivate: [adminGuard] },
      { path: 'settings',    loadComponent: () => import('./features/settings/settings.component').then(m => m.SettingsComponent) },
      { path: 'users',       loadComponent: () => import('./features/users/users.component').then(m => m.UsersComponent), canActivate: [adminGuard] },
    ]
  },
  { path: '**', redirectTo: '/app/catalog' }
];
