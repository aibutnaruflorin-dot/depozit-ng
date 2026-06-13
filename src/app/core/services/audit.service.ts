import { Injectable } from '@angular/core';
import { StorageService } from './storage.service';

export interface AuditEntry {
  ts:     number;
  userId: number;
  action: string;
  detail: string;
}

@Injectable({ providedIn: 'root' })
export class AuditService {
  private readonly KEY      = 'app_audit';
  private readonly MAX_LOGS = 1000;

  constructor(private storage: StorageService) {}

  log(userId: number, action: string, detail: string): void {
    const entries: AuditEntry[] = this.storage.get(this.KEY) ?? [];
    entries.unshift({ ts: Date.now(), userId, action, detail });
    if (entries.length > this.MAX_LOGS) entries.splice(this.MAX_LOGS);
    this.storage.set(this.KEY, entries);
  }

  getAll(): AuditEntry[] {
    return this.storage.get<AuditEntry[]>(this.KEY) ?? [];
  }

}
