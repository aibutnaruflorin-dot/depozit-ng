import { Component, AfterViewInit, signal } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../../core/services/auth.service';
import { StorageService } from '../../../core/services/storage.service';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { environment } from '../../../../environments/environment';

declare const turnstile: any;

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
export class LoginComponent implements AfterViewInit {
  form:       FormGroup;
  error       = '';
  hidePass    = true;
  showRecover = false;
  loading     = false;
  // UX: afișează cronometru de așteptare când GoTrue returnează 429
  countdown   = signal(0);

  private _timer:           ReturnType<typeof setInterval> | null = null;
  private _hWidgetId:       string | null = null;
  private _captchaResolver: ((token: string) => void) | null = null;

  constructor(
    private fb:      FormBuilder,
    private auth:    AuthService,
    private storage: StorageService,
    private router:  Router
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
  }

  ngAfterViewInit(): void {
    if (typeof turnstile !== 'undefined') {
      try {
        this._hWidgetId = turnstile.render('#h-captcha-login', {
          sitekey:          environment.turnstileSiteKey,
          execution:        'execute',
          appearance:       'interaction-only',
          callback:         (token: string) => { this._captchaResolver?.(token); this._captchaResolver = null; },
          'error-callback': () => { this._captchaResolver?.(''); this._captchaResolver = null; },
        });
      } catch { /* turnstile indisponibil */ }
    }
  }

  ngOnDestroy(): void {
    if (this._timer !== null) { clearInterval(this._timer); this._timer = null; }
  }

  private _getCaptchaToken(): Promise<string> {
    return new Promise<string>((resolve) => {
      if (typeof turnstile === 'undefined' || this._hWidgetId === null) { resolve(''); return; }
      this._captchaResolver = resolve;
      turnstile.execute(this._hWidgetId);
    });
  }

  // UX: afișează cronometru când GoTrue returnează 429 (rate-limiting nativ)
  private _startRateLimitCountdown(seconds: number): void {
    if (this._timer !== null) { clearInterval(this._timer); }
    this.countdown.set(seconds);
    this._timer = setInterval(() => {
      const remaining = this.countdown() - 1;
      if (remaining <= 0) {
        this.countdown.set(0);
        this.error = '';
        clearInterval(this._timer!);
        this._timer = null;
      } else {
        this.countdown.set(remaining);
        this.error = `Prea multe încercări. Așteptați ${remaining} secunde.`;
      }
    }, 1000);
  }

  async submit(): Promise<void> {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    if (this.countdown() > 0) return;

    const { username, password } = this.form.value;

    this.loading = true;
    this.error   = '';
    let ok = false;
    try {
      const captchaToken = await this._getCaptchaToken();
      ok = await this.auth.login(username, password, captchaToken);
    } catch (err: any) {
      this.loading = false;
      // GoTrue 429: rate-limit nativ Supabase
      if (err?.status === 429 || err?.message?.includes('429')) {
        const retryAfter = parseInt(err?.headers?.['retry-after'] ?? '60', 10);
        this._startRateLimitCountdown(retryAfter);
      } else {
        this.error = 'Eroare internă la autentificare. Verificați consola.';
        console.error('[Login]', err);
      }
      return;
    }
    this.loading = false;

    if (ok) {
      const session = this.auth.session();
      if (session?.mustChangePassword) {
        this.router.navigate(['/app/account'], { queryParams: { forceChange: '1' } });
      } else {
        const isMobile = window.innerWidth < 768;
        this.router.navigate([isMobile ? '/app/m-catalog' : '/app/catalog']);
      }
    } else {
      this.error = 'Username sau parolă incorectă.';
      this.form.get('password')?.reset();
      if (typeof turnstile !== 'undefined' && this._hWidgetId !== null) {
        turnstile.reset(this._hWidgetId);
      }
    }
  }
}
