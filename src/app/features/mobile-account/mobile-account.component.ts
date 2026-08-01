import { Component, AfterViewInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MobileNavComponent } from '../../shared/mobile-nav/mobile-nav.component';
import { environment } from '../../../environments/environment';

declare const turnstile: any;

@Component({
  selector: 'app-mobile-account',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatIconModule, MatSnackBarModule, MobileNavComponent],
  templateUrl: './mobile-account.component.html',
  styleUrl: './mobile-account.component.scss'
})
export class MobileAccountComponent implements AfterViewInit {
  showPassForm = signal(false);
  forced       = false;
  hideOld     = true;
  hideNew     = true;
  hideConf    = true;
  msg         = signal('');
  msgOk       = signal(false);

  form: FormGroup;

  private _hWidgetId:       string | null = null;
  private _captchaResolver: ((token: string) => void) | null = null;

  readonly newPassValue = signal('');

  readonly rules = computed(() => {
    const v = this.newPassValue();
    return [
      { label: 'Minim 8 caractere',       ok: v.length >= 8 },
      { label: 'Cel puțin o literă mare', ok: /[A-Z]/.test(v) },
      { label: 'Cel puțin o cifră',       ok: /[0-9]/.test(v) },
    ];
  });

  readonly strength = computed(() => {
    const met = this.rules().filter(r => r.ok).length;
    if (met === 0) return { label: '', level: 0 };
    if (met === 1) return { label: 'Slabă',    level: 1 };
    if (met === 2) return { label: 'Medie',    level: 2 };
    return              { label: 'Puternică', level: 3 };
  });

  constructor(
    public auth: AuthService,
    private fb: FormBuilder,
    private snackBar: MatSnackBar,
    private route: ActivatedRoute
  ) {
    this.forced = route.snapshot.queryParamMap.get('forceChange') === '1';
    this.form = this.fb.group({
      oldPass: ['', Validators.required],
      newPass: ['', [Validators.required, Validators.minLength(8)]],
      confirm: ['', Validators.required]
    });
    this.form.get('newPass')!.valueChanges.subscribe(v => this.newPassValue.set(v ?? ''));
    if (this.forced) this.showPassForm.set(true);
  }

  ngAfterViewInit(): void {
    if (typeof turnstile !== 'undefined') {
      try {
        this._hWidgetId = turnstile.render('#h-captcha-m-account', {
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

  roleLabel(): string {
    const map: Record<string, string> = {
      keyuser: 'Administrator', sofer: 'Șofer', agent: 'Agent',
      ajutor_manipulant: 'Ajutor manipulant', contabilitate: 'Contabilitate', 'sub-agent': 'Sub-agent',
    };
    return map[this.auth.session()?.role ?? ''] ?? this.auth.session()?.role ?? '';
  }

  async save(): Promise<void> {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const { oldPass, newPass, confirm } = this.form.value;
    if (newPass !== confirm) { this.msg.set('Parolele noi nu coincid.'); this.msgOk.set(false); return; }
    const session = this.auth.session();
    if (!session) return;
    const captchaToken = await this._getCaptchaToken();
    const res = await this.auth.changePassword(session.userId, oldPass, newPass, captchaToken);
    this.msg.set(res.msg); this.msgOk.set(res.ok);
    if (res.ok) {
      this.form.reset(); this.newPassValue.set('');
      if (!this.forced) this.showPassForm.set(false);
      if (typeof turnstile !== 'undefined' && this._hWidgetId !== null) {
        turnstile.reset(this._hWidgetId);
      }
    }
  }

  async logout(): Promise<void> { await this.auth.logout(); }
}
