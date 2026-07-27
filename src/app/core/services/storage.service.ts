import { Injectable } from '@angular/core';
import { DEFAULT_PERMISSIONS } from '../models/app-permission.model';
import { SupabaseService } from './supabase.service';

@Injectable({ providedIn: 'root' })
export class StorageService {
  constructor(private supabase: SupabaseService) {}

  get<T>(key: string): T | null {
    try {
      const val = localStorage.getItem(key);
      return val ? JSON.parse(val) : null;
    } catch {
      return null;
    }
  }

  set(key: string, val: unknown, syncRemote = true): void {
    try {
      localStorage.setItem(key, JSON.stringify(val));
      if (syncRemote && this.supabase.isSyncKey(key)) {
        this.supabase.upsert(key, val);
      }
    } catch (e) {
      console.error('StorageService.set failed', key, e);
    }
  }

  remove(key: string): void {
    localStorage.removeItem(key);
  }

  init(): void {
    // Valorile default se scriu DOAR în localStorage (syncRemote=false)
    // app_users eliminat — autentificarea e prin Supabase Auth (profiles table)
    if (!this.get('app_permissions')) this.set('app_permissions', DEFAULT_PERMISSIONS, false);
    if (!this.get('app_orders')) this.set('app_orders', [], false);
    if (!this.get('app_catalogs')) {
      this.set('app_catalogs', [
        { id: 'cat1', name: 'Catalog 1', color: '#2196F3', dataSource: 'excel', apiUrl: '', apiKey: '', apiGestiune: '' },
        { id: 'cat2', name: 'Catalog 2', color: '#4CAF50', dataSource: 'excel', apiUrl: '', apiKey: '', apiGestiune: '' }
      ], false);
    }
  }
}
