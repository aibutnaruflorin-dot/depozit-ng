import { Component, computed, signal } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { AuthService } from '../../core/services/auth.service';

interface PassRule { label: string; ok: boolean; }

@Component({
  selector: 'app-account',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatIconModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatDividerModule],
  templateUrl: './account.component.html',
  styleUrl: './account.component.scss'
})
export class AccountComponent {
  form:   FormGroup;
  msg     = '';
  msgOk   = false;
  forced  = false;

  hideOld     = true;
  hideNew     = true;
  hideConfirm = true;

  newPassValue = signal('');

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

  async save(): Promise<void> {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const { oldPass, newPass, confirm } = this.form.value;
    if (newPass !== confirm) {
      this.msg   = 'Parolele noi nu coincid.';
      this.msgOk = false;
      return;
    }
    const session = this.auth.session();
    if (!session) return;
    const res = await this.auth.changePassword(session.userId, oldPass, newPass);
    this.msg   = res.msg;
    this.msgOk = res.ok;
    if (res.ok) {
      this.form.reset();
      this.newPassValue.set('');
      this.forced = false;
    }
  }
}
