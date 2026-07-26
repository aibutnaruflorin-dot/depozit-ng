/**
 * Utilitare Supabase kv_store pentru izolarea testelor E2E.
 * kvClear() → șterge toate rândurile din kv_store (curăță starea între rulări).
 * kvUpsert() → scrie o cheie în kv_store (pentru teste care injectează date via page.evaluate).
 * Ambele sunt no-op silențioase dacă Supabase nu rulează.
 */

const SB_URL     = 'http://127.0.0.1:54321/rest/v1';
const SB_SVC_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'
  + '.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0'
  + '.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const SB_HDR = {
  apikey:          SB_SVC_KEY,
  Authorization:   `Bearer ${SB_SVC_KEY}`,
  Prefer:          'return=minimal',
  'Content-Type':  'application/json',
};

export async function kvClear(): Promise<void> {
  try {
    await fetch(`${SB_URL}/kv_store?key=neq.KEEP_NOTHING`, {
      method: 'DELETE',
      headers: SB_HDR,
      signal: AbortSignal.timeout(5000),
    });
  } catch { /* Supabase indisponibil */ }
}

export async function kvUpsert(key: string, value: unknown): Promise<void> {
  try {
    await fetch(`${SB_URL}/kv_store?key=eq.${encodeURIComponent(key)}`, {
      method: 'DELETE',
      headers: SB_HDR,
      signal: AbortSignal.timeout(5000),
    });
    await fetch(`${SB_URL}/kv_store`, {
      method: 'POST',
      headers: SB_HDR,
      body: JSON.stringify({ key, value }),
      signal: AbortSignal.timeout(5000),
    });
  } catch { /* Supabase indisponibil */ }
}
