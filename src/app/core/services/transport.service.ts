import { Injectable, signal, computed } from '@angular/core';
import { StorageService } from './storage.service';
import { Vehicle } from '../models/vehicle.model';
import { Driver } from '../models/driver.model';
import { Transport, TransportStatus } from '../models/transport.model';

@Injectable({ providedIn: 'root' })
export class TransportService {
  private _vehicles  = signal<Vehicle[]>([]);
  private _drivers   = signal<Driver[]>([]);
  private _transports = signal<Transport[]>([]);

  readonly vehicles   = this._vehicles.asReadonly();
  readonly drivers    = this._drivers.asReadonly();
  readonly transports = this._transports.asReadonly();

  readonly active = computed(() =>
    this._transports().filter(t => t.status !== 'livrat')
      .sort((a, b) => a.oraPlecare.localeCompare(b.oraPlecare))
  );
  readonly history = computed(() =>
    this._transports().filter(t => t.status === 'livrat')
      .sort((a, b) => b.oraPlecare.localeCompare(a.oraPlecare))
  );

  constructor(private storage: StorageService) {
    this._vehicles.set(this.storage.get<Vehicle[]>('app_vehicles') ?? []);
    this._drivers.set(this.storage.get<Driver[]>('app_drivers') ?? []);
    this._transports.set(this.storage.get<Transport[]>('app_transports') ?? []);
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

  // ── Drivers ───────────────────────────────────────────────────────────────

  addDriver(d: Omit<Driver, 'id'>): void {
    const driver: Driver = { ...d, id: this._uid() };
    this._save('drivers', [...this._drivers(), driver]);
  }

  updateDriver(id: string, changes: Partial<Omit<Driver, 'id'>>): void {
    this._save('drivers', this._drivers().map(d => d.id === id ? { ...d, ...changes } : d));
  }

  deleteDriver(id: string): void {
    this._save('drivers', this._drivers().filter(d => d.id !== id));
  }

  getDriver(id: string): Driver | undefined {
    return this._drivers().find(d => d.id === id);
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
    this.updateTransport(id, { status });
  }

  deleteTransport(id: string): void {
    this._save('transports', this._transports().filter(t => t.id !== id));
  }

  getTransport(id: string): Transport | undefined {
    return this._transports().find(t => t.id === id);
  }

  /** Returns the active transport containing this orderId, if any */
  transportForOrder(orderId: string): Transport | undefined {
    return this._transports().find(t => t.orderIds.includes(orderId) && t.status !== 'livrat');
  }

  formatDateTime(dt: string): string {
    if (!dt) return '—';
    return new Date(dt).toLocaleString('ro-RO', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private _uid(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  }

  private _save(key: 'vehicles' | 'drivers' | 'transports', data: any[]): void {
    this.storage.set(`app_${key}`, data);
    if (key === 'vehicles')   this._vehicles.set(data);
    if (key === 'drivers')    this._drivers.set(data);
    if (key === 'transports') this._transports.set(data);
  }
}
