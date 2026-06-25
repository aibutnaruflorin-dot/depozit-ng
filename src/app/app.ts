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

  async ngOnInit(): Promise<void> {
    const remote = await this.supabase.loadAll();
    for (const [key, value] of Object.entries(remote)) {
      if (value !== null && value !== undefined) {
        try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
      }
    }
  }
}
