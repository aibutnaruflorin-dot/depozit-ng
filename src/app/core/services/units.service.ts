import { Injectable, signal } from '@angular/core';
import { StorageService } from './storage.service';
import { UnitOfMeasure } from '../models/unit-of-measure.model';

const STORAGE_KEY = 'app_units';

@Injectable({ providedIn: 'root' })
export class UnitsService {
  private _units = signal<UnitOfMeasure[]>([]);
  readonly units = this._units.asReadonly();

  constructor(private storage: StorageService) {
    const saved = this.storage.get<UnitOfMeasure[]>(STORAGE_KEY);
    if (saved) this._units.set(saved);
  }

  getAll(): UnitOfMeasure[] { return this._units(); }

  allowDecimal(umCode: string): boolean {
    const entry = this._units().find(u => u.code.toUpperCase() === umCode.toUpperCase());
    return entry?.allowDecimal ?? false;
  }

  hasCode(umCode: string): boolean {
    return this._units().some(u => u.code.toUpperCase() === umCode.toUpperCase());
  }

  /** Detect UMs from a list of products; adds any new codes (allowDecimal=false). */
  ensureFromProducts(ums: string[]): void {
    const current = this._units();
    const existing = new Set(current.map(u => u.code.toUpperCase()));
    const toAdd = [...new Set(ums.map(u => u.trim().toUpperCase()).filter(u => u && !existing.has(u)))];
    if (!toAdd.length) return;
    const updated = [...current, ...toAdd.map(code => ({ code, allowDecimal: false }))];
    this._units.set(updated);
    this._save(updated);
  }

  add(code: string, allowDecimal = false): boolean {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed || this.hasCode(trimmed)) return false;
    const updated = [...this._units(), { code: trimmed, allowDecimal }];
    this._units.set(updated);
    this._save(updated);
    return true;
  }

  update(oldCode: string, newCode: string, allowDecimal: boolean): boolean {
    const trimmedNew = newCode.trim().toUpperCase();
    if (!trimmedNew) return false;
    const current = this._units();
    const idx = current.findIndex(u => u.code.toUpperCase() === oldCode.toUpperCase());
    if (idx === -1) return false;
    if (trimmedNew !== oldCode.toUpperCase() && this.hasCode(trimmedNew)) return false;
    const updated = current.map((u, i) => i === idx ? { code: trimmedNew, allowDecimal } : u);
    this._units.set(updated);
    this._save(updated);
    return true;
  }

  delete(code: string): void {
    const updated = this._units().filter(u => u.code.toUpperCase() !== code.toUpperCase());
    this._units.set(updated);
    this._save(updated);
  }

  private _save(units: UnitOfMeasure[]): void {
    this.storage.set(STORAGE_KEY, units);
  }
}
