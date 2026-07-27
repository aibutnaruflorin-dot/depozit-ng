import { ApplicationConfig, provideZoneChangeDetection, APP_INITIALIZER } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideNativeDateAdapter } from '@angular/material/core';
import { providePrimeNG } from 'primeng/config';
import Aura from '@primeng/themes/aura';
import { routes } from './app.routes';
import { SupabaseService } from './core/services/supabase.service';
import { TransportService } from './core/services/transport.service';

// AV3-01: cheile sensibile nu se încarcă niciodată din remote — previne privilege escalation
const BLOCKED_FROM_REMOTE = new Set(['app_users', 'app_permissions', 'app_session']);

// H3: chei care trebuie să fie neapărat array — orice altă formă = date otrăvite
const ARRAY_KEYS = new Set([
  'app_orders', 'app_transports', 'app_vehicles', 'app_catalogs'
]);

function isValidRemoteShape(key: string, value: unknown): boolean {
  if (value === null || typeof value !== 'object') return false;
  if (ARRAY_KEYS.has(key) || key.startsWith('app_catalog_') || key.startsWith('app_products_')) {
    return Array.isArray(value);
  }
  if (key.startsWith('_lk_')) {
    const v = value as Record<string, unknown>;
    return typeof v['attempts'] === 'number' && typeof v['lockedUntil'] === 'number';
  }
  return true;
}

function initApp(supabase: SupabaseService, transport: TransportService) {
  return async () => {
    // Încarcă profiluri pentru lista de șoferi (disponibilă pe orice pagină la startup)
    const profiles = await supabase.getProfiles();
    if (profiles.length) transport.refreshUsers(profiles);

    // Sincronizează date operaționale din kv_store remote
    const remote = await supabase.loadAll();
    for (const [key, value] of Object.entries(remote)) {
      if (BLOCKED_FROM_REMOTE.has(key)) continue;
      if (value !== null && value !== undefined) {
        if (!isValidRemoteShape(key, value)) {
          console.warn('[initApp] rejected invalid shape for key:', key);
          continue;
        }
        try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
      }
    }
  };
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideAnimationsAsync(),
    provideNativeDateAdapter(),
    providePrimeNG({
      theme: {
        preset: Aura,
        options: {
          prefix: 'p',
          darkModeSelector: '[data-theme="dark"]',
          cssLayer: false
        }
      }
    }),
    {
      provide: APP_INITIALIZER,
      useFactory: initApp,
      deps: [SupabaseService, TransportService],
      multi: true
    }
  ]
};
