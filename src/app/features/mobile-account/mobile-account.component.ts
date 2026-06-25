import { Component, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MobileNavComponent } from '../../shared/mobile-nav/mobile-nav.component';

@Component({
  selector: 'app-mobile-account',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatIconModule, MatSnackBarModule, MobileNavComponent],
  templateUrl: './mobile-account.component.html',
  styleUrl: './mobile-account.component.scss'
})
export class MobileAccountComponent {
  showPassForm = signal(false);
  hideOld     = true;
  hideNew     = true;
  hideConf    = true;
  msg         = signal('');
  msgOk       = signal(false);

  form: FormGroup;

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
    private snackBar: MatSnackBar
  ) {
    this.form = this.fb.group({
      oldPass: ['', Validators.required],
      newPass: ['', [Validators.required, Validators.minLength(8)]],
      confirm: ['', Validators.required]
    });
    this.form.get('newPass')!.valueChanges.subscribe(v => this.newPassValue.set(v ?? ''));
  }

  roleLabel(): string {
    const map: Record<string, string> = { keyuser: 'Administrator', sofer: 'Șofer', agent: 'Agent' };
    return map[this.auth.session()?.role ?? ''] ?? this.auth.session()?.role ?? '';
  }

  async save(): Promise<void> {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const { oldPass, newPass, confirm } = this.form.value;
    if (newPass !== confirm) { this.msg.set('Parolele noi nu coincid.'); this.msgOk.set(false); return; }
    const session = this.auth.session();
    if (!session) return;
    const res = await this.auth.changePassword(session.userId, oldPass, newPass);
    this.msg.set(res.msg); this.msgOk.set(res.ok);
    if (res.ok) { this.form.reset(); this.newPassValue.set(''); this.showPassForm.set(false); }
  }

  logout(): void { this.auth.logout(); }
}
