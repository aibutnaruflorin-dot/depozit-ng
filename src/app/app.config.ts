import { ApplicationConfig, provideZoneChangeDetection, APP_INITIALIZER } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideNativeDateAdapter } from '@angular/material/core';
import { providePrimeNG } from 'primeng/config';
import Aura from '@primeng/themes/aura';
import { routes } from './app.routes';
import { SupabaseService } from './core/services/supabase.service';

function initSupabase(supabase: SupabaseService) {
  return async () => {
    const remote = await supabase.loadAll();
    for (const [key, value] of Object.entries(remote)) {
      if (value !== null && value !== undefined) {
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
      useFactory: initSupabase,
      deps: [SupabaseService],
      multi: true
    }
  ]
};
