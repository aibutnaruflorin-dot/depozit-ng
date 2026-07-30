import { Component, OnDestroy, AfterViewInit, signal } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../../core/services/auth.service';
import { StorageService } from '../../../core/services/storage.service';
import { SupabaseService } from '../../../core/services/supabase.service';
import { CryptoService } from '../../../core/services/crypto.service';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';

declare const turnstile: any;
const TURNSTILE_SITE_KEY = '0x4AAAAAÄECCwF-jNxqvrvAr';

const MAX_ATTEMPTS = 5;

// AV3-04: backoff exponențial — 30s, 2min, 8min, 30min (plafon)
function lockoutMs(attempts: number): number {
  const cycles = Math.floor(attempts / MAX_ATTEMPTS);
  return Math.min(30_000 * Math.pow(4, cycles - 1), 30 * 60_000);
}

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    MatFormFieldModule, MatInputModule, MatButtonModule, MatCardModule, MatIconModule
  ],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent implements OnDestroy, AfterViewInit {
  form:        FormGroup;
  error        = '';
  hidePass     = true;
  showRecover  = false;
  loading      = false;
  countdown    = signal(0);

  private _timer: ReturnType<typeof setInterval> | null = null;
  private _hWidgetId: string | null = null;
  private _captchaResolver: ((token: string) => void) | null = null;

  constructor(
    private fb: FormBuilder,
    private auth: AuthService,
    private storage: StorageService,
    private supabase: SupabaseService,
    private crypto: CryptoService,
    private router: Router
  ) {
    this.storage.init();
    if (this.auth.isLoggedIn()) {
      const isMobile = window.innerWidth < 768;
      this.router.navigate([isMobile ? '/app/m-catalog' : '/app/catalog']);
    }
    this.form = this.fb.group({
      username: ['', Validators.required],
      password: ['', Validators.required]
    });
    // Dacă există un lockout activ din sesiunea anterioară, pornește contorul
    this._resumeCountdownIfLocked();
  }

  ngAfterViewInit(): void {
    // Inițializează widget-ul invizibil Turnstile (nedisponibil în dev cu Supabase local)
    if (typeof turnstile !== 'undefined') {
      try {
        this._hWidgetId = turnstile.render('#h-captcha-login', {
          sitekey:   TURNSTILE_SITE_KEY,
          execution: 'execute',
          appearance: 'interaction-only',
          callback:  (token: string) => { this._captchaResolver?.(token); this._captchaResolver = null; },
        });
      } catch { /* turnstile indisponibil */ }
    }
  }

  ngOnDestroy(): void {
    this._clearTimer();
  }

  private _getCaptchaToken(): Promise<string> {
    return new Promise<string>((resolve) => {
      if (typeof turnstile === 'undefined' || this._hWidgetId === null) { resolve(''); return; }
      this._captchaResolver = resolve;
      turnstile.execute(this._hWidgetId);
    });
  }

  private getLockout(): { attempts: number; lockedUntil: number } {
    try {
      const raw = localStorage.getItem('_lk');
      return raw ? JSON.parse(raw) : { attempts: 0, lockedUntil: 0 };
    } catch { return { attempts: 0, lockedUntil: 0 }; }
  }

  // AV3-08: cheia de lockout = hash SHA-256(username) — nu expune username-ul în kv_store
  private _lockoutKey(username: string): string {
    return `_lk_${this.crypto.hashWithSalt(username.trim().toLowerCase(), '_lk_').slice(0, 32)}`;
  }

  private async getKvLockout(username: string): Promise<{ attempts: number; lockedUntil: number }> {
    const data = await this.supabase.kvGet(this._lockoutKey(username));
    if (!data) return { attempts: 0, lockedUntil: 0 };
    return { attempts: data.attempts ?? 0, lockedUntil: data.lockedUntil ?? 0 };
  }

  private _resumeCountdownIfLocked(): void {
    const { lockedUntil } = this.getLockout();
    if (lockedUntil > Date.now()) {
      this._startCountdown(lockedUntil);
    }
  }

  private _startCountdown(lockedUntil: number): void {
    this._clearTimer();
    const update = () => {
      const secs = Math.ceil((lockedUntil - Date.now()) / 1000);
      if (secs <= 0) {
        this.countdown.set(0);
        this.error = '';
        this._clearTimer();
      } else {
        this.countdown.set(secs);
        this.error = `Prea multe încercări. Așteptați ${secs} secunde.`;
      }
    };
    update();
    this._timer = setInterval(update, 1000);
  }

  private _clearTimer(): void {
    if (this._timer !== null) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  async submit(): Promise<void> {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }

    const { username, password } = this.form.value;
    const lkKey   = this._lockoutKey(username);

    const lk    = this.getLockout();
    const kvLk  = await this.getKvLockout(username);
    // Folosim cel mai strict lockout (localStorage sau kv_store)
    const lockedUntil = Math.max(lk.lockedUntil, kvLk.lockedUntil);
    if (lockedUntil > Date.now()) {
      this._startCountdown(lockedUntil);
      return;
    }

    this.loading = true;
    this.error   = '';
    let ok = false;
    try {
      const captchaToken = await this._getCaptchaToken();
      ok = await this.auth.login(username, password, captchaToken);
    } catch (err) {
      this.loading = false;
      this.error = 'Eroare internă la autentificare. Verificați consola.';
      console.error('[Login]', err);
      return;
    }
    this.loading = false;

    if (ok) {
      localStorage.removeItem('_lk');
      this.supabase.upsert(lkKey, { attempts: 0, lockedUntil: 0 });
      this._clearTimer();
      const session = this.auth.session();
      if (session?.mustChangePassword) {
        this.router.navigate(['/app/account'], { queryParams: { forceChange: '1' } });
      } else {
        const isMobile = window.innerWidth < 768;
        this.router.navigate([isMobile ? '/app/m-catalog' : '/app/catalog']);
      }
    } else {
      const attempts    = Math.max(lk.attempts, kvLk.attempts) + 1;
      const newLockedUntil = attempts >= MAX_ATTEMPTS ? Date.now() + lockoutMs(attempts) : 0;
      localStorage.setItem('_lk', JSON.stringify({ attempts, lockedUntil: newLockedUntil }));
      this.supabase.upsert(lkKey, { attempts, lockedUntil: newLockedUntil });
      if (newLockedUntil) {
        this._startCountdown(newLockedUntil);
      } else {
        this.error = `Username sau parolă incorectă. (${attempts}/${MAX_ATTEMPTS})`;
      }
      this.form.get('password')?.reset();
      // Reset widget pentru tentativa următoare
      if (typeof turnstile !== 'undefined' && this._hWidgetId !== null) {
        turnstile.reset(this._hWidgetId);
      }
    }
  }
}
