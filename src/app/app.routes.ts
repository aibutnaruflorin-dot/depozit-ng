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
      { path: 'm-catalog',        canActivate: [pageGuard], data: { pageId: 'catalog' }, loadComponent: () => import('./features/mobile-catalog/mobile-catalog.component').then(m => m.MobileCatalogComponent) },
      { path: 'm-catalog-detail', canActivate: [pageGuard], data: { pageId: 'catalog' }, loadComponent: () => import('./features/mobile-catalog-detail/mobile-catalog-detail.component').then(m => m.MobileCatalogDetailComponent) },
      { path: 'm-new-order',   canActivate: [pageGuard], data: { pageId: 'comenzi_noi' }, loadComponent: () => import('./features/mobile-new-order/mobile-new-order.component').then(m => m.MobileNewOrderComponent) },
      { path: 'm-history-me',  canActivate: [pageGuard], data: { pageId: 'comenzi' },     loadComponent: () => import('./features/mobile-history-me/mobile-history-me.component').then(m => m.MobileHistoryMeComponent) },
      { path: 'm-history-all', canActivate: [pageGuard], data: { pageId: 'istoric' },     loadComponent: () => import('./features/mobile-history-all/mobile-history-all.component').then(m => m.MobileHistoryAllComponent) },
      { path: 'm-transport',   canActivate: [pageGuard], data: { pageId: 'transport' },   loadComponent: () => import('./features/mobile-transport/mobile-transport.component').then(m => m.MobileTransportComponent) },
      { path: 'm-my-trips',    canActivate: [pageGuard], data: { pageId: 'cursele_mele' },loadComponent: () => import('./features/mobile-my-trips/mobile-my-trips.component').then(m => m.MobileMyTripsComponent) },
      { path: 'm-account',     loadComponent: () => import('./features/mobile-account/mobile-account.component').then(m => m.MobileAccountComponent) },
      { path: 'm-settings',    loadComponent: () => import('./features/mobile-settings/mobile-settings.component').then(m => m.MobileSettingsComponent) },
      { path: 'm-about',       loadComponent: () => import('./features/mobile-about/mobile-about.component').then(m => m.MobileAboutComponent) },
      { path: 'm-security',    loadComponent: () => import('./features/mobile-security/mobile-security.component').then(m => m.MobileSecurityComponent) },
      { path: 'm-manual',      loadComponent: () => import('./features/mobile-manual/mobile-manual.component').then(m => m.MobileManualComponent) },
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
  { path: 'm', redirectTo: '/app/m-catalog', pathMatch: 'full' },
  { path: '**', redirectTo: '/app/catalog' }
];
