import { Component, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { AuditService, AuditEntry } from '../../core/services/audit.service';
import { StorageService } from '../../core/services/storage.service';
import { User } from '../../core/models/user.model';
import { MobileNavComponent } from '../../shared/mobile-nav/mobile-nav.component';

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
  selector: 'app-mobile-security',
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule, MobileNavComponent],
  templateUrl: './mobile-security.component.html',
  styleUrl: './mobile-security.component.scss'
})
export class MobileSecurityComponent {
  entries      = signal<AuditEntry[]>([]);
  filterAction = signal('');

  readonly ACTION_LABELS = ACTION_LABELS;
  readonly allActions    = Object.keys(ACTION_LABELS);

  private users: User[] = [];

  constructor(private audit: AuditService, private storage: StorageService) {
    this.users = this.storage.get<User[]>('app_users') ?? [];
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
