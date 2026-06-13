import { Component, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AuditService, AuditEntry } from '../../core/services/audit.service';
import { StorageService } from '../../core/services/storage.service';
import { User } from '../../core/models/user.model';

const ACTION_LABELS: Record<string, string> = {
  LOGIN:          'Autentificare',
  LOGOUT:         'Deconectare',
  PASS_CHANGE:    'Schimbare parolă proprie',
  ADMIN_SET_PASS: 'Parolă setată de admin',
  USER_CREATE:    'Utilizator creat',
  USER_EDIT:      'Utilizator editat',
  USER_DELETE:    'Utilizator șters',
  PERIOD_RESET:   'Curățare sesiune',
};

@Component({
  selector: 'app-security',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatButtonModule, MatTooltipModule],
  templateUrl: './security.component.html',
  styleUrl: './security.component.scss'
})
export class SecurityComponent {
  entries  = signal<AuditEntry[]>([]);
  filterAction = signal('');

  readonly ACTION_LABELS = ACTION_LABELS;
  readonly allActions    = Object.keys(ACTION_LABELS);

  private users: User[] = [];

  constructor(private audit: AuditService, private storage: StorageService) {
    this.users   = this.storage.get<User[]>('app_users') ?? [];
    this.entries.set(this.audit.getAll());
  }

  readonly filtered = computed(() => {
    const f = this.filterAction();
    return f ? this.entries().filter(e => e.action === f) : this.entries();
  });

  userName(userId: number): string {
    return this.users.find(u => u.id === userId)?.username ?? `#${userId}`;
  }

  actionLabel(action: string): string {
    return ACTION_LABELS[action] ?? action;
  }

  refresh(): void {
    this.users = this.storage.get<User[]>('app_users') ?? [];
    this.entries.set(this.audit.getAll());
  }
}
