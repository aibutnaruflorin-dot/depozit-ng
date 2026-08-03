/**
 * global-setup.ts (prod)
 * Rulează o singură dată înainte de toate testele de producție.
 * Creează userii de test și vehiculele/șoferii E2E dacă nu există deja.
 */

import { chromium } from '@playwright/test';
import {
  ensureTestUser, ensureTestVehicles, ensureTestDrivers,
  ADMIN_PASS, ADMIN_USER, TEST_USERS,
} from './helpers/prod-auth';

export default async function globalSetup(): Promise<void> {
  if (!ADMIN_PASS) {
    console.error('\n[prod-setup] EROARE: ADMIN_PASS nu e setat în .env.prod-e2e\n');
    process.exit(1);
  }

  const browser = await chromium.launch();
  const page    = await browser.newPage();

  console.log(`[prod-setup] Conectat ca ${ADMIN_USER}@depozit.internal`);

  // ── Utilizatori E2E ────────────────────────────────────────────────────────
  const users: Array<{ username: string; password: string; role: string; name: string }> = [
    { username: TEST_USERS.agent.username,         password: TEST_USERS.agent.password,         role: 'agent',            name: 'E2E Agent'         },
    { username: TEST_USERS.sofer.username,         password: TEST_USERS.sofer.password,         role: 'sofer',            name: 'E2E Sofer'         },
    { username: TEST_USERS.ajutor.username,        password: TEST_USERS.ajutor.password,        role: 'ajutor_manipulant',name: 'E2E Ajutor'        },
    { username: TEST_USERS.sofer2.username,        password: TEST_USERS.sofer2.password,        role: 'sofer',            name: 'E2E Sofer2'        },
    { username: TEST_USERS.subagent.username,      password: TEST_USERS.subagent.password,      role: 'sub-agent',        name: 'E2E Subagent'      },
    { username: TEST_USERS.contabilitate.username, password: TEST_USERS.contabilitate.password, role: 'contabilitate',    name: 'E2E Contabilitate' },
  ];

  for (const u of users) {
    await ensureTestUser(page, u);
  }

  // ── Vehicule & Șoferi E2E ──────────────────────────────────────────────────
  await ensureTestVehicles(page);
  await ensureTestDrivers(page);

  await browser.close();
  console.log('[prod-setup] Setup complet — testele pot porni.\n');
}
