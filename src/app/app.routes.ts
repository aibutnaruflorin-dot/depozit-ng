import { Routes } from '@angular/router';
import { authGuard, adminGuard, pageGuard } from './core/guards/auth.guard';

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
      { path: 'catalog',     canActivate: [pageGuard], data: { pageId: 'catalog' },      loadComponent: () => import('./features/catalog/catalog.component').then(m => m.CatalogComponent) },
      { path: 'new-order',   canActivate: [pageGuard], data: { pageId: 'comenzi_noi' }, loadComponent: () => import('./features/new-order/new-order.component').then(m => m.NewOrderComponent) },
      { path: 'history-me',  canActivate: [pageGuard], data: { pageId: 'comenzi' },     loadComponent: () => import('./features/history/history.component').then(m => m.HistoryComponent) },
      { path: 'history-all', canActivate: [pageGuard], data: { pageId: 'istoric' },     loadComponent: () => import('./features/history-all/history-all.component').then(m => m.HistoryAllComponent) },
      { path: 'transport',   canActivate: [pageGuard], data: { pageId: 'transport' },   loadComponent: () => import('./features/transport/transport.component').then(m => m.TransportComponent) },
      { path: 'my-trips',    canActivate: [pageGuard], data: { pageId: 'cursele_mele' },loadComponent: () => import('./features/my-trips/my-trips.component').then(m => m.MyTripsComponent) },
      { path: 'manual',      canActivate: [pageGuard], data: { pageId: 'manual' },      loadComponent: () => import('./features/manual/manual.component').then(m => m.ManualComponent) },
      { path: 'account',     loadComponent: () => import('./features/account/account.component').then(m => m.AccountComponent) },
      { path: 'users',       canActivate: [adminGuard], loadComponent: () => import('./features/users/users.component').then(m => m.UsersComponent) },
      { path: 'settings',    canActivate: [adminGuard], loadComponent: () => import('./features/settings/settings.component').then(m => m.SettingsComponent) },
      { path: 'security',    canActivate: [adminGuard], loadComponent: () => import('./features/security/security.component').then(m => m.SecurityComponent) },
      { path: 'about',       loadComponent: () => import('./features/about/about.component').then(m => m.AboutComponent) },
    ]
  },
  { path: '**', redirectTo: '/app/catalog' }
];
