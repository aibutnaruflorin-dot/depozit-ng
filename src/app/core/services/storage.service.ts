import { Injectable } from '@angular/core';
import { User } from '../models/user.model';

@Injectable({ providedIn: 'root' })
export class StorageService {
  get<T>(key: string): T | null {
    try {
      const val = localStorage.getItem(key);
      return val ? JSON.parse(val) : null;
    } catch {
      return null;
    }
  }

  set(key: string, val: unknown): void {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) {
      console.error('StorageService.set failed', key, e);
    }
  }

  remove(key: string): void {
    localStorage.removeItem(key);
  }

  init(): void {
    if (!this.get('app_users')) {
      this.set('app_users', [
        { id: 1, name: 'Administrator', username: 'admin',  password: 'admin123', role: 'admin', active: true },
        { id: 2, name: 'Agent 1',       username: 'agent1', password: 'agent123', role: 'agent', active: true }
      ] as User[]);
    }
    // Cleanup: remove any leftover superadmin users / fix roles
    const users = this.get<User[]>('app_users') ?? [];
    const validRoles = ['admin', 'agent', 'contabilitate', 'sub-agent'];
    const fixed = users
      .filter(u => u.username !== 'superadmin')
      .map(u => validRoles.includes(u.role as string) ? u : { ...u, role: 'admin' as any });
    if (fixed.length !== users.length || fixed.some((u, i) => u.role !== users[i]?.role)) {
      this.set('app_users', fixed);
    }
    if (!this.get('app_orders')) this.set('app_orders', []);
    if (!this.get('app_catalogs')) {
      this.set('app_catalogs', [
        { id: 'cat1', name: 'Catalog 1', color: '#2196F3', dataSource: 'excel', apiUrl: '', apiKey: '', apiGestiune: '' },
        { id: 'cat2', name: 'Catalog 2', color: '#4CAF50', dataSource: 'excel', apiUrl: '', apiKey: '', apiGestiune: '' }
      ]);
    }
  }
}
