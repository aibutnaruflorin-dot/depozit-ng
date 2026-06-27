import { Injectable } from '@angular/core';
import { User } from '../models/user.model';
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
    // ca să nu suprascrie datele reale din Supabase când conexiunea pică
    if (!this.get('app_users')) {
      this.set('app_users', [
        { id: 1, name: 'Administrator', username: 'admin',  password: 'admin123',  _v: 1, mustChangePassword: true, role: 'keyuser', active: true },
        { id: 2, name: 'Agent 1',       username: 'agent1', password: 'agent123', _v: 1, mustChangePassword: true, role: 'agent',   active: true }
      ] as User[], false);
    }
    if (!this.get('app_permissions')) this.set('app_permissions', DEFAULT_PERMISSIONS, false);

    // Cleanup: remove superadmin, migrate admin→keyuser — acestea se sync pentru că sunt modificări reale
    const storedPerms = this.get<any[]>('app_permissions') ?? [];
    const customRoleIds = storedPerms.map((p: any) => p.id as string);
    const builtInRoles  = ['keyuser', 'sofer', 'ajutor_manipulant', 'agent', 'contabilitate', 'sub-agent'];
    const validRoles    = [...builtInRoles, ...customRoleIds];

    const users = this.get<User[]>('app_users') ?? [];
    const fixed = users
      .filter(u => u.username !== 'superadmin')
      .map(u => (u.role as string) === 'admin' ? { ...u, role: 'keyuser' as any } : u)
      .map(u => validRoles.includes(u.role as string) ? u : { ...u, role: 'keyuser' as any });
    if (fixed.length !== users.length || fixed.some((u, i) => u.role !== users[i]?.role)) {
      this.set('app_users', fixed);
    }
    if (!this.get('app_orders')) this.set('app_orders', [], false);
    if (!this.get('app_catalogs')) {
      this.set('app_catalogs', [
        { id: 'cat1', name: 'Catalog 1', color: '#2196F3', dataSource: 'excel', apiUrl: '', apiKey: '', apiGestiune: '' },
        { id: 'cat2', name: 'Catalog 2', color: '#4CAF50', dataSource: 'excel', apiUrl: '', apiKey: '', apiGestiune: '' }
      ], false);
    }
  }
}
