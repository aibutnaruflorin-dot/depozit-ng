import { Component, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { StorageService } from '../../core/services/storage.service';
import { User } from '../../core/models/user.model';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatCardModule } from '@angular/material/card';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, MatSnackBarModule, MatCardModule, MatTooltipModule,
    TableModule, TagModule
  ],
  templateUrl: './users.component.html',
  styleUrl:    './users.component.scss'
})
export class UsersComponent {
  users   = signal<User[]>([]);
  showModal = signal(false);
  editingId = signal<number | null>(null);
  form: FormGroup;

  constructor(
    private fb: FormBuilder,
    public auth: AuthService,
    private storage: StorageService,
    private snackBar: MatSnackBar
  ) {
    this.users.set(this.storage.get<User[]>('app_users') || []);
    this.form = this.fb.group({
      name:     ['', Validators.required],
      username: ['', Validators.required],
      password: [''],
      role:     ['agent', Validators.required]
    });
  }

  openAdd(): void {
    this.editingId.set(null);
    this.form.reset({ name: '', username: '', password: '', role: 'agent' });
    this.form.get('password')?.setValidators(Validators.required);
    this.form.get('password')?.updateValueAndValidity();
    this.showModal.set(true);
  }

  openEdit(user: User): void {
    this.editingId.set(user.id);
    this.form.patchValue({ name: user.name, username: user.username, password: '', role: user.role });
    this.form.get('password')?.clearValidators();
    this.form.get('password')?.updateValueAndValidity();
    this.showModal.set(true);
  }

  closeModal(): void { this.showModal.set(false); }

  save(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const { name, username, password, role } = this.form.value;
    let users = [...this.users()];
    const id = this.editingId();

    if (id === null) {
      const dup = users.find(u => u.username === username.trim().toLowerCase());
      if (dup) { this.snackBar.open('Username deja folosit.', '', { duration: 3000 }); return; }
      const newId = Math.max(0, ...users.map(u => u.id)) + 1;
      users.push({ id: newId, name: name.trim(), username: username.trim().toLowerCase(), password, role, active: true });
    } else {
      const idx = users.findIndex(u => u.id === id);
      if (idx === -1) return;
      const dup = users.find(u => u.username === username.trim().toLowerCase() && u.id !== id);
      if (dup) { this.snackBar.open('Username deja folosit.', '', { duration: 3000 }); return; }
      users[idx] = { ...users[idx], name: name.trim(), username: username.trim().toLowerCase(), role };
      if (password) users[idx].password = password;
    }

    this.storage.set('app_users', users);
    this.users.set(users);
    this.showModal.set(false);
    this.snackBar.open('✅ Utilizatorul a fost salvat.', '', { duration: 2500, panelClass: ['snack-success'] });
  }

  toggleActive(user: User): void {
    const session = this.auth.session();
    if (session?.userId === user.id) {
      this.snackBar.open('Nu puteți dezactiva propriul cont.', '', { duration: 3000 });
      return;
    }
    let users = this.users().map(u => u.id === user.id ? { ...u, active: !u.active } : u);
    this.storage.set('app_users', users);
    this.users.set(users);
    this.snackBar.open(`Utilizatorul ${user.active ? 'dezactivat' : 'activat'}.`, '', { duration: 2000 });
  }
}
