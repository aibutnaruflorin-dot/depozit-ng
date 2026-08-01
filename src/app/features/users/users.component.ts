import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { SupabaseService } from '../../core/services/supabase.service';
import { Profile } from '../../core/models/profile.model';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatCardModule } from '@angular/material/card';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { DragModalDirective } from '../../shared/drag-modal.directive';

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, FormsModule,
    MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, MatSnackBarModule, MatCardModule, MatTooltipModule,
    TableModule, TagModule, DragModalDirective
  ],
  templateUrl: './users.component.html',
  styleUrl:    './users.component.scss'
})
export class UsersComponent implements OnInit {
  users     = signal<Profile[]>([]);
  showModal = signal(false);
  editingId = signal<string | null>(null);
  saving    = signal(false);
  form: FormGroup;

  showResetModal  = signal(false);
  resetUserId     = signal<string | null>(null);
  resetUserName   = signal('');
  resetNewPass    = '';
  resetting       = signal(false);

  constructor(
    private fb: FormBuilder,
    public auth: AuthService,
    private supabase: SupabaseService,
    private snackBar: MatSnackBar
  ) {
    this.form = this.fb.group({
      name:     ['', Validators.required],
      username: ['', Validators.required],
      password: ['', Validators.minLength(8)],
      role:     ['agent', Validators.required]
    });
  }

  async ngOnInit(): Promise<void> {
    await this._reload();
  }

  private async _reload(): Promise<void> {
    this.users.set(await this.supabase.getProfiles());
  }

  openAdd(): void {
    this.editingId.set(null);
    this.form.reset({ name: '', username: '', password: '', role: 'agent' });
    this.form.get('password')?.setValidators([Validators.required, Validators.minLength(8)]);
    this.form.get('password')?.updateValueAndValidity();
    this.showModal.set(true);
  }

  openEdit(user: Profile): void {
    this.editingId.set(user.id);
    this.form.patchValue({ name: user.name, username: user.username, password: '', role: user.role });
    this.form.get('password')?.clearValidators();
    this.form.get('password')?.updateValueAndValidity();
    this.showModal.set(true);
  }

  closeModal(): void { this.showModal.set(false); }

  async save(): Promise<void> {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const { name, username, password, role } = this.form.value;
    const id = this.editingId();
    this.saving.set(true);
    try {
      if (id === null) {
        await this.supabase.callManageUsers('create', {
          username: username.trim().toLowerCase(),
          password,
          name: name.trim(),
          role,
        });
      } else {
        await this.supabase.updateProfile(id, { name: name.trim(), role });
        if (password) {
          await this.supabase.callManageUsers('reset_password', { userId: id, password });
        }
      }
      await this._reload();
      this.showModal.set(false);
      this.snackBar.open('Utilizatorul a fost salvat.', '', { duration: 2500, panelClass: ['snack-success'] });
    } catch (e: any) {
      this.snackBar.open(e?.message ?? 'Eroare la salvare.', '', { duration: 4000 });
    } finally {
      this.saving.set(false);
    }
  }

  openReset(user: Profile): void {
    this.resetUserId.set(user.id);
    this.resetUserName.set(user.name);
    this.resetNewPass = '';
    this.showResetModal.set(true);
  }

  generatePassword(): void {
    const upper  = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const digits = '0123456789';
    const lower  = 'abcdefghijklmnopqrstuvwxyz';
    const all    = upper + digits + lower;
    const arr = Array.from({ length: 8 }, () => all[Math.floor(Math.random() * all.length)]);
    arr[0] = upper[Math.floor(Math.random() * upper.length)];
    arr[1] = digits[Math.floor(Math.random() * digits.length)];
    this.resetNewPass = arr.sort(() => Math.random() - 0.5).join('');
  }

  async confirmReset(): Promise<void> {
    const id  = this.resetUserId();
    const pwd = this.resetNewPass;
    if (!id || !pwd) return;
    if (pwd.length < 8 || !/[A-Z]/.test(pwd) || !/[0-9]/.test(pwd)) {
      this.snackBar.open('Parola trebuie să aibă minim 8 caractere, o literă mare și o cifră.', '', { duration: 3500 });
      return;
    }
    this.resetting.set(true);
    try {
      await this.supabase.callManageUsers('reset_password', { userId: id, password: pwd });
      this.showResetModal.set(false);
      this.snackBar.open('Parola a fost resetată. Utilizatorul va fi forțat să o schimbe la login.', '', { duration: 4000, panelClass: ['snack-success'] });
    } catch (e: any) {
      this.snackBar.open(e?.message ?? 'Eroare la resetare.', '', { duration: 4000 });
    } finally {
      this.resetting.set(false);
    }
  }

  async toggleActive(user: Profile): Promise<void> {
    const session = this.auth.session();
    if (session?.supabaseId === user.id) {
      this.snackBar.open('Nu puteți dezactiva propriul cont.', '', { duration: 3000 });
      return;
    }
    try {
      // V1b: prin Edge Function ca să revoce sesiunile la dezactivare
      await this.supabase.callManageUsers('update', {
        username: user.username,
        name:     user.name,
        role:     user.role,
        active:   !user.active,
      });
      await this._reload();
      this.snackBar.open(`Utilizatorul ${user.active ? 'dezactivat' : 'activat'}.`, '', { duration: 2000 });
    } catch (e: any) {
      this.snackBar.open(e?.message ?? 'Eroare.', '', { duration: 3000 });
    }
  }
}
