import { Injectable } from '@angular/core';
import { createClient, SupabaseClient, Session } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';
import { Profile } from '../models/profile.model';

const SYNC_KEYS = [
  'app_orders', 'app_catalogs', 'app_transports',
  'app_vehicles', 'app_whatsapp_contacts',
  'app_stock_log', 'app_units', 'app_drivers'
  // app_users: exclus — parolele nu se sincronizează remote (Audit v2)
  // app_permissions: exclus — privilege escalation via kv_store tampering (Audit v3 AV3-01)
];

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  private client: SupabaseClient;

  constructor() {
    this.client = createClient(environment.supabaseUrl, environment.supabaseKey);
  }

  // ─── Auth ────────────────────────────────────────────────────────────────────

  async signIn(username: string, password: string, captchaToken?: string): Promise<{ user: any; session: Session } | null> {
    const email = `${username.trim().toLowerCase()}@depozit.internal`;
    const { data, error } = await this.client.auth.signInWithPassword({
      email,
      password,
      options: captchaToken ? { captchaToken } : undefined,
    });
    if (error) {
      if (error.status === 429) throw error;
      console.error('[Auth signIn error]', error.status, error.message, error);
      return null;
    }
    if (!data.session) return null;
    return { user: data.user, session: data.session };
  }

  async signOut(): Promise<void> {
    await this.client.auth.signOut();
  }

  async getSession(): Promise<Session | null> {
    const { data } = await this.client.auth.getSession();
    return data.session;
  }

  async updatePassword(newPassword: string): Promise<boolean> {
    const { error } = await this.client.auth.updateUser({ password: newPassword });
    return !error;
  }

  onAuthStateChange(callback: (event: string, session: any) => void): void {
    this.client.auth.onAuthStateChange((event, session) => callback(event, session));
  }

  // ─── Profiles ────────────────────────────────────────────────────────────────

  async getProfile(userId: string): Promise<Profile | null> {
    try {
      const { data } = await this.client
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      return data ?? null;
    } catch { return null; }
  }

  async getProfiles(): Promise<Profile[]> {
    try {
      const { data } = await this.client
        .from('profiles')
        .select('*')
        .order('created_at');
      return data ?? [];
    } catch { return []; }
  }

  async updateProfile(id: string, updates: Partial<Profile>): Promise<void> {
    const { error } = await this.client.from('profiles').update(updates).eq('id', id);
    if (error) throw new Error(error.message);
  }

  // ─── Edge Function — gestiune utilizatori (doar admin) ────────────────────────

  async callManageUsers(action: string, payload: Record<string, unknown>): Promise<any> {
    const { data, error } = await this.client.functions.invoke('manage-users', {
      body: { action, payload }
    });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);
    return data;
  }

  // ─── kv_store ────────────────────────────────────────────────────────────────

  isSyncKey(key: string): boolean {
    return SYNC_KEYS.includes(key) || key.startsWith('app_products_') || key.startsWith('app_catalog_');
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

  async kvGet(key: string): Promise<any> {
    try {
      const { data } = await this.client.from('kv_store').select('value').eq('key', key).maybeSingle();
      return data?.value ?? null;
    } catch { return null; }
  }

  async upsert(key: string, value: any): Promise<void> {
    try {
      await this.client.from('kv_store').upsert({ key, value, updated_at: new Date().toISOString() });
    } catch (e) {
      console.warn('Supabase upsert failed:', key, e);
    }
  }

  async logAudit(userId: string, action: string, detail: string): Promise<void> {
    try {
      await this.client.from('audit_log').insert({
        user_id:    userId,
        action,
        details:    detail,
        created_at: new Date().toISOString(),
      });
    } catch (e) {
      console.warn('Supabase audit log failed:', e);
    }
  }

  async getAuditLogs(limit = 500): Promise<{ ts: number; userId: string; action: string; detail: string }[]> {
    try {
      const { data, error } = await this.client
        .from('audit_log')
        .select('user_id, action, details, created_at')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) { console.warn('getAuditLogs error:', error.message); return []; }
      return (data ?? []).map(r => ({
        ts:     new Date(r.created_at).getTime(),
        userId: r.user_id ?? '',
        action: r.action,
        detail: r.details ?? '',
      }));
    } catch (e) {
      console.warn('getAuditLogs failed:', e);
      return [];
    }
  }
}
