import { Component, computed, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AuditService, AuditEntry } from '../../core/services/audit.service';
import { SupabaseService } from '../../core/services/supabase.service';
import { Profile } from '../../core/models/profile.model';

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
export class SecurityComponent implements OnInit {
  entries      = signal<AuditEntry[]>([]);
  filterAction = signal('');

  readonly ACTION_LABELS = ACTION_LABELS;
  readonly allActions    = Object.keys(ACTION_LABELS);

  private profiles: Profile[] = [];

  constructor(private audit: AuditService, private supabase: SupabaseService) {}

  async ngOnInit(): Promise<void> {
    this.profiles = await this.supabase.getProfiles();
    const remote = await this.supabase.getAuditLogs();
    this.entries.set(remote.length ? remote : this.audit.getAll());
  }

  readonly filtered = computed(() => {
    const f = this.filterAction();
    return f ? this.entries().filter(e => e.action === f) : this.entries();
  });

  userName(userId: string | number): string {
    const id = String(userId);
    if (!id || id === '0') return 'System';
    const profile = this.profiles.find(p => p.id === id);
    return profile?.username ?? id.substring(0, 8);
  }

  actionLabel(action: string): string {
    return ACTION_LABELS[action] ?? action;
  }

  refresh(): void {
    Promise.all([this.supabase.getProfiles(), this.supabase.getAuditLogs()]).then(([profiles, remote]) => {
      this.profiles = profiles;
      this.entries.set(remote.length ? remote : this.audit.getAll());
    });
  }
}
