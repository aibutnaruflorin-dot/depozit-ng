# E2E Testing — depozit-ng

> **Suita de producție:** 748 teste · 21 proiecte Playwright · desktop + mobile  
> **Ultima rulare stabilă:** 2026-08-05 · 744 passed · 2 flaky · 0 failed · exit 0

---

## Cuprins

1. [Cum se rulează](#1-cum-se-rulează)
2. [Arhitectura suitei](#2-arhitectura-suitei)
3. [Utilizatori de test](#3-utilizatori-de-test)
4. [Matricea de acces per rol](#4-matricea-de-acces-per-rol)
5. [Inventarul spec-urilor](#5-inventarul-spec-urilor)
6. [Fluxuri acoperite](#6-fluxuri-acoperite)
7. [Statusuri comenzi și transport](#7-statusuri-comenzi-și-transport)
8. [Patterns tehnice esențiale](#8-patterns-tehnice-esențiale)
9. [Teste skipped — cauze cunoscute](#9-teste-skipped--cauze-cunoscute)
10. [Ce lipsește — plan de extindere](#10-ce-lipsește--plan-de-extindere)
11. [Raportare](#11-raportare)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. Cum se rulează

### Pregătire (obligatoriu înainte de rulare)

1. **Dezactivează Turnstile** în Supabase Dashboard:  
   `Authentication → Attack Protection → dezactivează`  
   _(testele se autentifică direct via REST API, nu prin formularul cu captcha)_

2. **Creează fișierul de credențiale** (este gitignored):
   ```
   .env.prod-e2e
   ```
   ```env
   PROD_ADMIN_EMAIL=admin@depozit.internal
   PROD_ADMIN_PASSWORD=<parola_admin>
   ```

3. **Instalează dependențele Playwright** (prima dată):
   ```bash
   npx playwright install chromium
   ```

### Rulare

```bash
# Suita completă de producție
npx playwright test --config=playwright.prod.config.ts

# Sau cu npm script
npm run test:prod
```

```bash
# Un singur proiect
npx playwright test --config=playwright.prod.config.ts --project="Desktop - Auth & Permissions"

# Un singur spec
npx playwright test --config=playwright.prod.config.ts e2e/prod-tests/04-order-lifecycle.spec.ts

# Cu raport HTML deschis după rulare
npx playwright test --config=playwright.prod.config.ts; npx playwright show-report e2e/prod-report
```

### Curățare după rulare

**Reactivează Turnstile** imediat după terminare:  
`Authentication → Attack Protection → activează`

---

## 2. Arhitectura suitei

```
e2e/
├── playwright.prod.config.ts        # Config principal — 21 proiecte
├── prod-tests/
│   ├── global-setup.ts              # Setup global: creează useri E2E, vehicule, șoferi
│   ├── helpers/
│   │   └── prod-auth.ts             # loginAs(), ensureTestUser(), setKvValue()
│   ├── 01-auth-permissions.spec.ts  # Desktop: autentificare + permisiuni per rol
│   ├── 02-catalog-buffer.spec.ts    # Desktop: catalog, buffer stoc
│   ├── 03-order-draft.spec.ts       # Desktop: ciornă comandă (DRF)
│   ├── 04-order-lifecycle.spec.ts   # Desktop: lifecycle complet comenzi (OLC)
│   ├── 05-transport-tonnage.spec.ts # Desktop: transport + tonaj vehicul (TRN)
│   ├── 06-transport-multi.spec.ts   # Desktop: curse cu comenzi multiple (MULTI)
│   ├── 07-driver-lifecycle.spec.ts  # Desktop: lifecycle șofer (DRV)
│   ├── 08-notifications.spec.ts     # Desktop: WhatsApp/email notificări (NOTIF)
│   ├── 09-settings-users.spec.ts    # Desktop: settings, users, security (SET)
│   ├── 10-mobile-auth-perms.spec.ts # Mobile: autentificare + permisiuni (MAUTH)
│   ├── 11-mobile-catalog-buffer.spec.ts  # Mobile: catalog (MCAT)
│   ├── 12-mobile-order-draft.spec.ts     # Mobile: ciornă comandă (MDRF)
│   ├── 13-mobile-order-lifecycle.spec.ts # Mobile: lifecycle comenzi (MOLC)
│   ├── 14-mobile-transport-tonnage.spec.ts # Mobile: transport + tonaj (MTRN)
│   ├── 15-mobile-transport-multi.spec.ts   # Mobile: curse multiple (MMULTI)
│   ├── 16-mobile-driver-lifecycle.spec.ts  # Mobile: lifecycle șofer (MDRV)
│   ├── 17-mobile-notifications.spec.ts     # Mobile: notificări (MNOTIF)
│   ├── 18-mobile-settings-users.spec.ts    # Mobile: settings + utilizatori (MSET)
│   ├── 19-mobile-navigation-ux.spec.ts     # Mobile: navigare, UX, back button (MNAV)
│   # ── Legacy (compatibilitate) ──
│   ├── 01-smoke.spec.ts             # Smoke rapid desktop
│   ├── 02-admin-flow.spec.ts        # Admin flow desktop
│   ├── 03-order-lifecycle.spec.ts   # Order lifecycle legacy
│   ├── 04-mobile.spec.ts            # Smoke mobile
│   └── 05-order-lifecycle-mobile.spec.ts  # MOL: lifecycle complet mobil (MOL-01..11)
```

### Configurare Playwright

| Parametru | Valoare |
|-----------|---------|
| `baseURL` | `https://depozit-ng.vercel.app` |
| `workers` | 1 (secvențial — stare comună în KV Supabase) |
| `retries` | 1 (un retry per test) |
| `timeout` | 45 000 ms per test |
| `actionTimeout` | 15 000 ms |
| `navigationTimeout` | 30 000 ms |

---

## 3. Utilizatori de test

Creați automat de `global-setup.ts` la fiecare rulare:

| Username | Rol | Observații |
|----------|-----|------------|
| `admin@depozit.internal` | `keyuser` | Admin principal — din `.env.prod-e2e` |
| `e2e_agent` | `agent` | Creează comenzi |
| `e2e_sofer` | `sofer` | Gestionează cursele proprii |
| `e2e_sofer2` | `sofer` | Al doilea șofer — izolare curse |
| `e2e_ajutor` | `ajutor_manipulant` | Acces limitat |
| `e2e_subagent` | `sub-agent` | Sub-agent |
| `e2e_contabilitate` | `contabilitate` | Acces read-only extins |

**Login rapid în teste:**
```typescript
import { loginAs } from './helpers/prod-auth';

// loginAs() injectează token-ul via addInitScript — nu navighează pagina!
await loginAs(page, 'agent');
await page.goto('/#/app/new-order');   // goto explicit obligatoriu după loginAs
```

---

## 4. Matricea de acces per rol

### Desktop

| Pagină | keyuser | agent | sub-agent | sofer | ajutor | contabilitate |
|--------|:-------:|:-----:|:---------:|:-----:|:------:|:-------------:|
| `/catalog` | ✅ full | ✅ read | ✅ read | ❌ | ❌ | ✅ read |
| `/new-order` | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ read |
| `/history-me` | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| `/history-all` | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| `/transport` | ✅ full | ✅ read | ❌ | ✅ read | ✅ read | ❌ |
| `/my-trips` | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| `/users` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/settings` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `/security` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

### Mobile (prefix `m-`)

| Pagină | keyuser | agent | sub-agent | sofer | ajutor | contabilitate |
|--------|:-------:|:-----:|:---------:|:-----:|:------:|:-------------:|
| `m-catalog` | ✅ full | ✅ read | ✅ read | ❌ | ❌ | ✅ read |
| `m-new-order` | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ read |
| `m-history-me` | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| `m-history-all` | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| `m-transport` | ✅ full | ✅ read | ❌ | ✅ read | ✅ read | ❌ |
| `m-my-trips` | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| `m-settings` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `m-security` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

---

## 5. Inventarul spec-urilor

### Desktop (01–09)

| Spec | Prefix test | Ce acoperă |
|------|-------------|------------|
| `01-auth-permissions` | `AUTH-` | Login valid per rol, parolă greșită, logout, redirect unauthorized |
| `02-catalog-buffer` | `CAT-` | Catalog se încarcă, buffer stoc vizibil, butoane adj per rol, ajustare buffer |
| `03-order-draft` | `DRF-` | Ciornă comandă: adaugă produse, salvează, apare în history-me |
| `04-order-lifecycle` | `OLC-` | history-all: filtrare status, detalii comandă, acceptare, ajustare cantitate |
| `05-transport-tonnage` | `TRN-` | Vehicule/șoferi E2E în kv_store, tonaj maxim, transport se încarcă per rol |
| `06-transport-multi` | `MULTI-` | Cursă cu comenzi multiple, coloane vizibile, TIR disponibil |
| `07-driver-lifecycle` | `DRV-` | Șoferi E2E, my-trips per șofer, izolare curse, confirmare, pornit, livrat |
| `08-notifications` | `NOTIF-` | Contacte WhatsApp în kv_store, buton notificare, câmpuri email |
| `09-settings-users` | `SET-` | /users, /settings, /security se încarcă; tabel utilizatori; audit log |

### Mobile (10–19)

| Spec | Prefix test | Ce acoperă |
|------|-------------|------------|
| `10-mobile-auth-perms` | `MAUTH-` | Login mobil, permisiuni FAB transport per rol, logout, redirect |
| `11-mobile-catalog-buffer` | `MCAT-` | m-catalog per rol, detaliu produs, back navigation |
| `12-mobile-order-draft` | `MDRF-` | m-new-order: CDK virtual scroll, adaugă produs, ciornă, redirect |
| `13-mobile-order-lifecycle` | `MOLC-` | m-history-all: tabel, chipuri status, filtrare, detalii |
| `14-mobile-transport-tonnage` | `MTRN-` | m-transport per rol, FAB admin, tonaj vehicul, performance |
| `15-mobile-transport-multi` | `MMULTI-` | Curse expandabile, comenzi în cursă, statusuri, izolare șoferi |
| `16-mobile-driver-lifecycle` | `MDRV-` | m-my-trips: cursele proprii, confirmare, pornit, livrat, izolare |
| `17-mobile-notifications` | `MNOTIF-` | m-settings notificări, câmpuri email, contacte WhatsApp |
| `18-mobile-settings-users` | `MSET-` | m-settings-users: lista utilizatori, creare utilizator |
| `19-mobile-navigation-ux` | `MNAV-` | Back button, deep link hash routing, login redirect, viewport fără scroll orizontal |

### Legacy (rulează în plus față de cele de mai sus)

| Spec | Proiect | Ce acoperă |
|------|---------|------------|
| `01-smoke` | Legacy Desktop | Smoke rapid: toate rutele per rol (admin, agent, sofer) |
| `02-admin-flow` | Legacy Desktop | AF-01..06: users, settings, audit log |
| `03-order-lifecycle` | Legacy Desktop | OL-01..10: flux complet agent→admin→sofer desktop |
| `04-mobile` | Legacy Mobile | Smoke rapid: toate rutele mobile per rol |
| `05-order-lifecycle-mobile` | Legacy Mobile | **MOL-01..11**: flux complet agent→admin→sofer mobil |

---

## 6. Fluxuri acoperite

### Flux complet comandă (testat în OL + MOL)

```
Agent trimite comandă
    │ status: TRIMIS
    ▼
Admin vede comanda în history-all
    │ Acceptă → status: ACCEPTAT
    │ Anulează → status: ANULAT
    ▼
Admin creează cursă transport (dacă cuLivrare: true)
    │ comanda → status: PLANIFICAT
    │ cursa → status: PLANIFICAT
    ▼
Șofer confirmă cursa
    │ cursa → status: ÎN LIVRARE
    ▼
Șofer finalizează livrarea
    │ comanda → status: LIVRAT / LIVRAT PARȚIAL
    │ cursa → status: LIVRAT
    ▼
Admin finalizează cu ajustări (opțional)
    │ comanda → status: FINALIZAT
    ▼
Agent vede statusul final în history-me
```

### Pattern de injectare date pentru teste seriale

Testele seriale (describe.serial) care au nevoie de date cross-test folosesc:

```typescript
// 1. Interceptează răspunsul GET kv_store ÎNAINTE de goto
await page.route('**/rest/v1/kv_store**', async (route) => {
  if (route.request().method() !== 'GET') { await route.continue(); return; }
  const resp = await route.fetch();
  const rows = await resp.json();
  const row = rows.find((r: any) => r.key === 'app_orders');
  if (row) row.value = myOrders;
  else rows.push({ key: 'app_orders', value: myOrders });
  await route.fulfill({ response: resp, json: rows });
});

// 2. Navighează — APP_INITIALIZER va citi datele interceptate
await page.goto('/#/app/m-history-all');
await page.waitForLoadState('networkidle');

// 3. Dezactivează interceptul
await page.unroute('**/rest/v1/kv_store**');
```

---

## 7. Statusuri comenzi și transport

### Comenzi

| Status intern | Afișat ca | Culoare | Când apare |
|---------------|-----------|---------|------------|
| `trimis` | Trimis | albastru | Agent trimite comanda |
| `acceptat` | Acceptată | verde | Admin acceptă |
| `planificat` | Planificat | mov | Admin adaugă comanda într-o cursă |
| `in_livrare` | În livrare | portocaliu | Șofer pornește cursa |
| `livrat_partial` | Livrat parțial | roz | Livrare parțială |
| `livrat` | Livrat | teal | Toată cantitatea livrată |
| `finalizat` | Finalizat | violet | Admin confirmă cu ajustări |
| `anulat` | Anulat | roșu | Admin anulează |

> **`formEligibleOrders()`** în transport form acceptă: `acceptat`, `livrat_partial`, `planificat` + `cuLivrare: true` + `!superseded` + cantitate rămasă > 0

### Transport (curse)

| Status intern | Afișat ca | Culoare | Când apare |
|---------------|-----------|---------|------------|
| `planificat` | Planificat | mov | Admin creează cursa |
| `in_livrare` | În livrare | portocaliu | Șofer pornește |
| `livrat` | Livrat | teal | Șofer finalizează |
| `anulat` | Anulat | roșu | Admin anulează |

---

## 8. Patterns tehnice esențiale

### APP_INITIALIZER suprascrie localStorage

Angular bootstraps complet la fiecare full-page load și apelează:
```
GET /rest/v1/kv_store?select=key,value
```
Această cerere suprascrie **toate** cheile din localStorage (cu excepția celor din `BLOCKED_FROM_REMOTE = ['app_users', 'app_permissions', 'app_session']`).

**Cheile afectate:** `app_orders`, `app_transports`, `app_catalogs`, `app_vehicles`, `app_drivers` etc.

**Soluție:** interceptează răspunsul KV cu `page.route()` și injectează datele direct în JSON-ul returnat de server, înainte ca Angular să le scrie în LS.

### Hash routing — când se declanșează full-reload

```
goto('/#/app/routeA') de la '/#/app/routeB'  → hash change → NU bootstrap
goto('/#/app/routeA') de la '/#/app/routeA'  → full reload  → bootstrap Angular
page.reload()                                  → full reload  → bootstrap Angular
```

Interceptul KV trebuie activ **înainte** de `goto` ori de câte ori există risc de full-reload.

### loginAs() nu navighează pagina

```typescript
await loginAs(page, 'agent');
// ❌ page rămâne la about:blank
// ✅ page.evaluate(() => localStorage) aruncă SecurityError la about:blank

await page.goto('/#/app/new-order');  // obligatoriu după loginAs
```

### Angular Material `[color]` binding vs atribut HTML

```typescript
// ❌ NU funcționează — [color] e property binding, nu atribut HTML
page.locator('button[color="primary"]')

// ✅ Funcționează — mat-flat-button e atribut static
page.locator('button[mat-flat-button]')
```

### Turnstile blochează `networkidle`

Cloudflare Turnstile face polling continuu pe `/login`. `networkidle` nu se resetează niciodată.

```typescript
// ❌ timeout după 30s
await page.goto('/#/login', { waitUntil: 'networkidle' });

// ✅ se termină după ce scripturile sunt executate
await page.goto('/#/login', { waitUntil: 'load' });
```

### Angular router guard — timing după redirect

Guard-ul se execută **async, 100–1200ms** după `networkidle`. Orice verificare de URL după redirect:

```typescript
await page.goto('/#/app/settings', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);  // așteaptă guard-ul
await expect(page).toHaveURL(/login/);
```

### Teste seriale cu retries

`describe.serial` + `retries: 1` → dacă un test eșuează, **întreg blocul serial** se rerulează de la testul eșuat. Variabilele module-level (definite în afara `describe`) se resetează la fiecare rerulare.

---

## 9. Teste skipped — cauze cunoscute

| Test ID | Cauză | Rezolvare necesară |
|---------|-------|--------------------|
| `TRN-01-01/02/03` | `kv_store` PATCH returnează 0 rows pentru vehicule E2E | Verifică RLS policies pe `kv_store` → UPDATE pentru keyuser JWT |
| `DRV-01-01/02` | Șoferii E2E nu pot fi scrisi în `app_drivers` via PATCH | Același root cause ca TRN |
| `MULTI-01-04` | TIR 25t E2E lipsește din `kv_store` | Dependent de fix-ul RLS de mai sus |

**Root cause comun:** `setKvValue()` din `prod-auth.ts` face PATCH pe Supabase REST API. Dacă rândul nu există sau RLS blochează UPDATE, se returnează 0 rows fără eroare. De investigat în Supabase Dashboard → Table Editor → `kv_store`.

---

## 10. Ce lipsește — plan de extindere

### Prioritate înaltă

#### A. Fix RLS kv_store (deblocant pentru 3 teste skipped)
- Verifică dacă rândurile `app_vehicles` / `app_drivers` există în `kv_store`
- Dacă nu: adaugă `INSERT` în `global-setup.ts` cu `upsert=true`
- Dacă da: verifică RLS UPDATE policy — condiția care blochează JWT-ul de admin

#### B. Spec nou: `20-mobile-order-send.spec.ts` — trimitere completă comandă pe mobil
```
MOSEND-01  Agent: m-new-order — CDK scroll vizibil
MOSEND-02  Agent: adaugă 2 produse diferite în coș
MOSEND-03  Agent: completează client + localitate + telefon
MOSEND-04  Agent: bifează "Cu livrare"
MOSEND-05  Agent: trimite comanda → redirect m-history-me
MOSEND-06  Agent: comanda apare cu status "Trimis"
MOSEND-07  Admin: vede comanda în m-history-all
MOSEND-08  Admin: acceptă comanda → status "Acceptată"
```

#### C. Spec nou: `10-desktop-order-send.spec.ts` — trimitere completă comandă pe desktop
Similar cu MOSEND dar pe desktop — completează golul dintre DRF (ciornă) și OLC (history-all).

### Prioritate medie

#### D. Spec nou: `21-mobile-settings-crud.spec.ts` — CRUD settings mobile
```
MSCRUD-01  m-settings-catalogs: adaugă catalog nou
MSCRUD-02  m-settings-catalogs: editează denumire
MSCRUD-03  m-settings-catalogs: șterge catalog (cu confirmare)
MSCRUD-04  m-settings-contacts: adaugă contact WhatsApp
MSCRUD-05  m-settings-vehicles: adaugă vehicul nou cu tonaj
MSCRUD-06  m-settings-units: adaugă unitate de măsură
```

#### E. Spec nou: `22-security-edge-cases.spec.ts` — securitate avansată
```
SEC-ADV-01  JWT expirat → redirect login (session timeout)
SEC-ADV-02  must_change_password=true → redirect schimbare parolă
SEC-ADV-03  Utilizator inactiv (active=false) → eroare la login
SEC-ADV-04  Tentative login eșuate → lockout (dacă implementat)
SEC-ADV-05  PATCH kv_store cu JWT agent → exception din trigger anti-wipe
SEC-ADV-06  Edge Function manage-users cu rol invalid → eroare validare
```

#### F. Spec nou: `23-performance-regression.spec.ts` — timpi de încărcare
```
PERF-01  Catalog desktop: < 3s la 100+ produse
PERF-02  History-all desktop: < 3s la 50+ comenzi
PERF-03  m-catalog mobile: < 4s (CDK virtual scroll)
PERF-04  m-transport mobile: < 4s (prag crescut față de 5s fix)
PERF-05  Login: < 5s de la submit până la dashboard
```
> Pragurile fixe (< 5000ms) sunt fragile pe rețea variabilă. Preferă media pe 3 măsurători sau prag mai larg.

### Prioritate scăzută / viitor

#### G. Teste de accesibilitate (a11y)
```
A11Y-01  Desktop: navigare completă cu Tab pe pagina de login
A11Y-02  Contrastul culorilor badges status ≥ 4.5:1
A11Y-03  Mobile: butoanele FAB au aria-label
```

#### H. Teste de import/export
```
IMPORT-01  Admin: import Excel produse — fișier valid → produse în catalog
IMPORT-02  Admin: import Excel invalid → mesaj eroare clar
EXPORT-01  Admin: export comenzi Excel — fișier descărcat cu date corecte
```

#### I. Teste multi-tab / concurență
```
CONCUR-01  Două sesiuni agent → comenzile nu se suprapun
CONCUR-02  Admin editează, agent trimite simultan → fără conflict
```

---

## 11. Raportare

### Raport HTML Playwright (built-in)

```bash
# Rulează și deschide raportul
npx playwright test --config=playwright.prod.config.ts
npx playwright show-report e2e/prod-report
```

Raportul se generează în `e2e/prod-report/` și conține:
- Screenshot la fiecare test eșuat
- Video la fiecare test eșuat
- Trace viewer pentru testele reîncercate

### Raport vizual personalizat

La fiecare rulare semnificativă, publicăm un raport vizual ca Artifact Claude:  
Format HTML cu scorecard, per-suite breakdown, fix-uri aplicate și plan de continuare.

**Template de sumar rapid (copiat în PR description):**

```
E2E Prod Suite — YYYY-MM-DD
──────────────────────────
Total:   748  |  Passed: 744  |  Flaky: 2  |  Failed: 0
Durată:  29m  |  Exit: 0  ✓

Flaky (trec la retry):
  - MAUTH-06-02: redirect login după logout (timing guard)
  - MDRV-05-03:  performance m-my-trips 5454ms vs 5000ms

Skipped (deliberat):
  - TRN-01-01/02/03, DRV-01-01/02: kv_store RLS PATCH
```

---

## 12. Troubleshooting

### Testele eșuează cu "NetworkError" sau "ERR_CONNECTION_REFUSED"

Vercel deployment e down sau build a eșuat. Verifică: `https://depozit-ng.vercel.app`

### `SecurityError: Failed to read localStorage` la `page.evaluate()`

Pagina e la `about:blank` — `loginAs()` nu navighează. Adaugă `await page.goto(url)` după `loginAs()`.

### Test timeout la `waitForLoadState('networkidle')` pe pagina `/login`

Turnstile e activat și face polling continuu. Dezactivează Attack Protection în Supabase sau folosește `{ waitUntil: 'load' }`.

### `expect(locator).toBeVisible()` timeout pe formular transport

Formularul transport mobil este `.mt-panel` (panel inline), nu `mat-dialog-container`. Selectele sunt native `select.mt-sel`, nu `mat-select`.

### Teste seriale eșuează în lanț după primul failure

`describe.serial` cu `retries: 1` rerulează blocul de la testul eșuat. Verifică dacă variabilele module-level sunt resetate corect între rerulări.

### `setKvValue()` returnează 0 rows (silent fail)

PATCH pe `kv_store` pentru o cheie inexistentă returnează 0 rows fără eroare. Adaugă `return=representation` la request și loghează răspunsul. Soluție: UPSERT în loc de PATCH.

### `mat-select` nu se deschide cu `.click()`

Angular Material select necesită uneori `.dispatchEvent('click')` sau click pe trigger-ul intern `.mat-select-trigger`.

---

## Contribuție

La adăugarea unui test nou:

1. **Alege spec-ul corect** — sau creează unul nou numerotând după ultimul existent
2. **Folosește prefix-ul consistent** — ex: `MOSEND-01`, `SEC-ADV-01`
3. **Adaugă `test.skip(!hasProducts, SKIP_MSG)`** la testele dependente de date
4. **Folosește route intercept** pentru orice date din `app_orders` / `app_transports`
5. **Nu face `goto` la același URL** fără intercept activ dacă există risc de full-reload
6. **Rulează suita completă** înainte de push și verifică 0 failed

```bash
npx playwright test --config=playwright.prod.config.ts
# Așteptat: X passed · 0 failed · exit 0
```
