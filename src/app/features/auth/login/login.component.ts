import { Component, OnDestroy, signal } from '@angular/core';
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

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS   = 30_000;

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
export class LoginComponent implements OnDestroy {
  form:        FormGroup;
  error        = '';
  hidePass     = true;
  showRecover  = false;
  loading      = false;
  countdown    = signal(0);

  private _timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private fb: FormBuilder,
    private auth: AuthService,
    private storage: StorageService,
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

  ngOnDestroy(): void {
    this._clearTimer();
  }

  private getLockout(): { attempts: number; lockedUntil: number } {
    try {
      const raw = localStorage.getItem('_lk');
      return raw ? JSON.parse(raw) : { attempts: 0, lockedUntil: 0 };
    } catch { return { attempts: 0, lockedUntil: 0 }; }
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

    const lk = this.getLockout();
    if (lk.lockedUntil > Date.now()) return; // blocat — mesajul se actualizează deja live

    this.loading = true;
    this.error   = '';
    const { username, password } = this.form.value;
    let ok = false;
    try {
      ok = await this.auth.login(username, password);
    } catch (err) {
      this.loading = false;
      this.error = 'Eroare internă la autentificare. Verificați consola.';
      console.error('[Login]', err);
      return;
    }
    this.loading = false;

    if (ok) {
      localStorage.removeItem('_lk');
      this._clearTimer();
      const session = this.auth.session();
      if (session?.mustChangePassword) {
        this.router.navigate(['/app/account'], { queryParams: { forceChange: '1' } });
      } else {
        const isMobile = window.innerWidth < 768;
        this.router.navigate([isMobile ? '/app/m-catalog' : '/app/catalog']);
      }
    } else {
      const attempts    = lk.attempts + 1;
      const lockedUntil = attempts >= MAX_ATTEMPTS ? Date.now() + LOCKOUT_MS : 0;
      localStorage.setItem('_lk', JSON.stringify({ attempts, lockedUntil }));
      if (lockedUntil) {
        this._startCountdown(lockedUntil);
      } else {
        this.error = `Username sau parolă incorectă. (${attempts}/${MAX_ATTEMPTS})`;
      }
      this.form.get('password')?.reset();
    }
  }
}
