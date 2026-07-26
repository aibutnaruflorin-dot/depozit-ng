/**
 * Global setup — rulează O SINGURĂ DATĂ înainte de toată suita Playwright.
 * Curăță kv_store Supabase local pentru a preveni contaminarea între rulări.
 * Dacă Supabase nu e pornit, setup-ul continuă fără eroare.
 */

import { request } from '@playwright/test';

const SB_URL     = 'http://127.0.0.1:54321/rest/v1';
const SB_SVC_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'
  + '.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0'
  + '.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

export default async function globalSetup(): Promise<void> {
  const ctx = await request.newContext();
  try {
    await ctx.delete(`${SB_URL}/kv_store?key=neq.KEEP_NOTHING`, {
      headers: {
        'apikey':        SB_SVC_KEY,
        'Authorization': `Bearer ${SB_SVC_KEY}`,
        'Prefer':        'return=minimal',
      },
      timeout: 5000,
    });
    console.log('[global-setup] kv_store curățat');
  } catch {
    console.log('[global-setup] Supabase indisponibil — kv_store omis');
  } finally {
    await ctx.dispose();
  }
}
