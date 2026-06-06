import { Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-account',
  standalone: true,
  imports: [ReactiveFormsModule, MatIconModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatDividerModule],
  templateUrl: './account.component.html',
  styleUrl: './account.component.scss'
})
export class AccountComponent {
  form: FormGroup;
  msg = '';
  msgOk = false;

  constructor(private fb: FormBuilder, public auth: AuthService) {
    this.form = this.fb.group({
      oldPass: ['', Validators.required],
      newPass: ['', [Validators.required, Validators.minLength(4)]],
      confirm: ['', Validators.required]
    });
  }

  save(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const { oldPass, newPass, confirm } = this.form.value;
    if (newPass !== confirm) {
      this.msg = 'Parolele noi nu coincid.';
      this.msgOk = false;
      return;
    }
    const session = this.auth.session();
    if (!session) return;
    const res = this.auth.changePassword(session.userId, oldPass, newPass);
    this.msg = res.msg;
    this.msgOk = res.ok;
    if (res.ok) this.form.reset();
  }
}
