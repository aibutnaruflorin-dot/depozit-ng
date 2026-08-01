import { Component, AfterViewInit, computed, signal } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { AuthService } from '../../core/services/auth.service';
import { environment } from '../../../environments/environment';

declare const turnstile: any;

interface PassRule { label: string; ok: boolean; }

@Component({
  selector: 'app-account',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatIconModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatDividerModule],
  templateUrl: './account.component.html',
  styleUrl: './account.component.scss'
})
export class AccountComponent implements AfterViewInit {
  form:   FormGroup;
  msg     = '';
  msgOk   = false;
  forced  = false;

  hideOld     = true;
  hideNew     = true;
  hideConfirm = true;
  saving      = false;

  newPassValue = signal('');

  private _hWidgetId:       string | null = null;
  private _captchaResolver: ((token: string) => void) | null = null;

  readonly rules = computed<PassRule[]>(() => {
    const v = this.newPassValue();
    return [
      { label: 'Minim 8 caractere',        ok: v.length >= 8 },
      { label: 'Cel puțin o literă mare',  ok: /[A-Z]/.test(v) },
      { label: 'Cel puțin o cifră',        ok: /[0-9]/.test(v) },
    ];
  });

  readonly strength = computed<{ label: string; level: number }>(() => {
    const met = this.rules().filter(r => r.ok).length;
    if (met === 0) return { label: '',          level: 0 };
    if (met === 1) return { label: 'Slabă',     level: 1 };
    if (met === 2) return { label: 'Medie',     level: 2 };
    return              { label: 'Puternică',  level: 3 };
  });

  constructor(private fb: FormBuilder, public auth: AuthService, route: ActivatedRoute) {
    this.forced = route.snapshot.queryParamMap.get('forceChange') === '1';
    this.form = this.fb.group({
      oldPass: ['', Validators.required],
      newPass: ['', [Validators.required, Validators.minLength(8)]],
      confirm: ['', Validators.required]
    });
    this.form.get('newPass')!.valueChanges.subscribe(v => this.newPassValue.set(v ?? ''));
  }

  ngAfterViewInit(): void {
    if (typeof turnstile !== 'undefined') {
      try {
        this._hWidgetId = turnstile.render('#h-captcha-account', {
          sitekey:          environment.turnstileSiteKey,
          execution:        'execute',
          appearance:       'interaction-only',
          callback:         (token: string) => { this._captchaResolver?.(token); this._captchaResolver = null; },
          'error-callback': () => { this._captchaResolver?.(''); this._captchaResolver = null; },
        });
      } catch { /* turnstile indisponibil */ }
    }
  }

  private _getCaptchaToken(): Promise<string> {
    return new Promise<string>((resolve) => {
      if (typeof turnstile === 'undefined' || this._hWidgetId === null) { resolve(''); return; }
      this._captchaResolver = resolve;
      turnstile.execute(this._hWidgetId);
    });
  }

  async save(): Promise<void> {
    if (this.saving) return;
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const { oldPass, newPass, confirm } = this.form.value;
    if (newPass !== confirm) {
      this.msg   = 'Parolele noi nu coincid.';
      this.msgOk = false;
      return;
    }
    const session = this.auth.session();
    if (!session) return;
    this.saving = true;
    try {
      const captchaToken = await this._getCaptchaToken();
      const res = await this.auth.changePassword(session.userId, oldPass, newPass, captchaToken);
      this.msg   = res.msg;
      this.msgOk = res.ok;
      if (res.ok) {
        this.form.reset();
        this.newPassValue.set('');
        this.forced = false;
        if (typeof turnstile !== 'undefined' && this._hWidgetId !== null) {
          turnstile.reset(this._hWidgetId);
        }
      }
    } finally {
      this.saving = false;
    }
  }
}
