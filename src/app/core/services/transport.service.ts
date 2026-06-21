import { Injectable, signal, computed } from '@angular/core';
import { StorageService } from './storage.service';
import { Vehicle } from '../models/vehicle.model';
import { Driver } from '../models/driver.model';
import { Transport, TransportStatus } from '../models/transport.model';
import { User } from '../models/user.model';

@Injectable({ providedIn: 'root' })
export class TransportService {
  private _vehicles   = signal<Vehicle[]>([]);
  private _users      = signal<User[]>([]);
  private _transports = signal<Transport[]>([]);

  readonly vehicles   = this._vehicles.asReadonly();
  readonly transports = this._transports.asReadonly();

  readonly drivers = computed<Driver[]>(() =>
    this._users()
      .filter(u => (u.role === 'sofer' || u.jobRole === 'sofer') && u.active !== false)
      .map(u => ({ id: String(u.id), nume: u.name, telefon: u.telefon ?? '' }))
  );

  readonly helpers = computed<Driver[]>(() =>
    this._users()
      .filter(u => (u.role === 'ajutor_manipulant' || u.jobRole === 'ajutor_manipulant') && u.active !== false)
      .map(u => ({ id: String(u.id), nume: u.name, telefon: u.telefon ?? '' }))
  );

  readonly helperOptions = computed<{ group: string; items: Driver[] }[]>(() => {
    const helpers = this.helpers();
    const drivers = this.drivers();
    const groups: { group: string; items: Driver[] }[] = [];
    if (helpers.length) groups.push({ group: 'Ajutor manipulant', items: helpers });
    if (drivers.length) groups.push({ group: 'Șoferi', items: drivers });
    return groups;
  });

  readonly active = computed(() =>
    this._transports().filter(t => t.status !== 'livrat' && t.status !== 'anulat')
      .sort((a, b) => a.oraPlecare.localeCompare(b.oraPlecare))
  );
  readonly history = computed(() =>
    this._transports().filter(t => t.status === 'livrat')
      .sort((a, b) => b.oraPlecare.localeCompare(a.oraPlecare))
  );

  constructor(private storage: StorageService) {
    this._vehicles.set(this.storage.get<Vehicle[]>('app_vehicles') ?? []);
    this._users.set(this.storage.get<User[]>('app_users') ?? []);
    const raw = (this.storage.get<any[]>('app_transports') ?? []).map((t: any) => {
      if (!t.deliveries && t.orderIds) {
        return { ...t, deliveries: (t.orderIds as string[]).map(id => ({ orderId: id, items: [] })) };
      }
      return t as Transport;
    });
    this._transports.set(raw);
  }

  // ── Vehicles ──────────────────────────────────────────────────────────────

  addVehicle(v: Omit<Vehicle, 'id'>): void {
    const vehicle: Vehicle = { ...v, id: this._uid() };
    this._save('vehicles', [...this._vehicles(), vehicle]);
  }

  updateVehicle(id: string, changes: Partial<Omit<Vehicle, 'id'>>): void {
    this._save('vehicles', this._vehicles().map(v => v.id === id ? { ...v, ...changes } : v));
  }

  deleteVehicle(id: string): void {
    this._save('vehicles', this._vehicles().filter(v => v.id !== id));
  }

  getVehicle(id: string): Vehicle | undefined {
    return this._vehicles().find(v => v.id === id);
  }

  // ── Drivers (derived from users with jobRole='sofer') ────────────────────

  refreshUsers(users: User[]): void {
    this._users.set(users);
  }

  getDriver(id: string): Driver | undefined {
    return this.drivers().find(d => d.id === id);
  }

  // ── Transports ────────────────────────────────────────────────────────────

  createTransport(t: Omit<Transport, 'id' | 'createdAt' | 'status'>): Transport {
    const transport: Transport = {
      ...t, id: this._uid(),
      status: 'planificat',
      createdAt: new Date().toISOString()
    };
    this._save('transports', [...this._transports(), transport]);
    return transport;
  }

  updateTransport(id: string, changes: Partial<Omit<Transport, 'id' | 'createdAt'>>): void {
    this._save('transports', this._transports().map(t => t.id === id ? { ...t, ...changes } : t));
  }

  setStatus(id: string, status: TransportStatus): void {
    const now = new Date().toISOString();
    const changes: Partial<Omit<Transport, 'id' | 'createdAt'>> = { status };
    if (status === 'in_livrare') changes.startedAt  = now;
    if (status === 'livrat')     changes.completedAt = now;
    if (status === 'anulat')     changes.cancelledAt = now;
    this.updateTransport(id, changes);
  }

  cancelTrip(id: string): void {
    this.setStatus(id, 'anulat');
  }

  markWaSent(id: string, target: 'driver' | 'helper'): void {
    const now = new Date().toISOString();
    this.updateTransport(id, target === 'driver' ? { waSentDriverAt: now } : { waSentHelperAt: now });
  }

  deleteTransport(id: string): void {
    this._save('transports', this._transports().filter(t => t.id !== id));
  }

  getTransport(id: string): Transport | undefined {
    return this._transports().find(t => t.id === id);
  }

  /** Returns the active transport containing this orderId, if any */
  transportForOrder(orderId: string): Transport | undefined {
    return this._transports().find(
      t => t.status !== 'livrat' && t.deliveries.some(d => d.orderId === orderId)
    );
  }

  formatDateTime(dt: string): string {
    if (!dt) return '—';
    return new Date(dt).toLocaleString('ro-RO', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  resetPeriod(): void {
    this._save('transports', []);
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private _uid(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  }

  private _save(key: 'vehicles' | 'transports', data: any[]): void {
    this.storage.set(`app_${key}`, data);
    if (key === 'vehicles')   this._vehicles.set(data);
    if (key === 'transports') this._transports.set(data);
  }
}
