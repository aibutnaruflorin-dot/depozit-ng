import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

const SYNC_KEYS = [
  'app_users', 'app_orders', 'app_catalogs', 'app_transports',
  'app_vehicles', 'app_permissions', 'app_whatsapp_contacts',
  'app_stockLog', 'app_units', 'app_drivers'
];

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  private client: SupabaseClient;

  constructor() {
    this.client = createClient(environment.supabaseUrl, environment.supabaseKey);
  }

  isSyncKey(key: string): boolean {
    return SYNC_KEYS.includes(key) || key.startsWith('app_products_');
  }

  async loadAll(): Promise<Record<string, any>> {
    try {
      const { data, error } = await this.client
        .from('kv_store')
        .select('key, value');
      if (error) { console.warn('Supabase loadAll error:', error.message); return {}; }
      const result: Record<string, any> = {};
      for (const row of data ?? []) result[row.key] = row.value;
      return result;
    } catch (e) {
      console.warn('Supabase loadAll failed:', e);
      return {};
    }
  }

  async upsert(key: string, value: any): Promise<void> {
    try {
      await this.client.from('kv_store').upsert({ key, value, updated_at: new Date().toISOString() });
    } catch (e) {
      console.warn('Supabase upsert failed:', key, e);
    }
  }
}
