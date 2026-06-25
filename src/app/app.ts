import { Component, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SupabaseService } from './core/services/supabase.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: '<router-outlet />',
})
export class App implements OnInit {
  constructor(private supabase: SupabaseService) {}

  ngOnInit(): void {
    // Non-blocking: app renders immediately from localStorage,
    // Supabase data merges in the background
    this.supabase.loadAll().then(remote => {
      for (const [key, value] of Object.entries(remote)) {
        if (value !== null && value !== undefined) {
          try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
        }
      }
    }).catch(() => {});
  }
}
