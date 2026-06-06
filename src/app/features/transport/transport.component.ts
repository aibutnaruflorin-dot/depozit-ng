import { Component, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTabsModule } from '@angular/material/tabs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatChipsModule } from '@angular/material/chips';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { TransportService } from '../../core/services/transport.service';
import { OrdersService } from '../../core/services/orders.service';
import { AuthService } from '../../core/services/auth.service';
import { Transport, TransportStatus } from '../../core/models/transport.model';
import { Order } from '../../core/models/order.model';

interface TimelineBar {
  id: string;
  left: number;
  width: number;
  returnLeft: number;
  returnWidth: number;
  status: string;
  orders: string;
  driverName: string;
  destination: string;
  tooltip: string;
  overlap: boolean;
}

interface TimelineRow {
  id: string;
  vehicleName: string;
  plateName: string;
  bars: TimelineBar[];
}

interface TimelineData {
  start: number;
  end: number;
  range: number;
  multiDay: boolean;
  dateTicks: { label: string; left: number; width: number }[];
  ticks: { label: string; left: number; major: boolean }[];
  vehicles: TimelineRow[];
}

/** sosire + (sosire − plecare) = time when vehicle/driver is back at base */
function effectiveEndMs(plecareMs: number, sosireMs: number): number {
  return sosireMs + (sosireMs - plecareMs);
}

function plecareNotInPast(ctrl: AbstractControl): ValidationErrors | null {
  const date: Date | null = ctrl.get('plecareDate')?.value;
  const time: string      = ctrl.get('plecareTime')?.value ?? '';
  if (!date || !time) return null;
  const [h, m] = time.split(':').map(Number);
  const plecare = new Date(date);
  plecare.setHours(h, m, 0, 0);
  return plecare >= new Date() ? null : { plecareInPast: true };
}

function sosireAfterPlecare(ctrl: AbstractControl): ValidationErrors | null {
  const plecareDate: Date | null = ctrl.get('plecareDate')?.value;
  const plecareTime: string      = ctrl.get('plecareTime')?.value ?? '';
  const sosireDate:  Date | null = ctrl.get('sosireDate')?.value;
  const sosireTime:  string      = ctrl.get('sosireTime')?.value ?? '';
  if (!plecareDate || !plecareTime || !sosireDate || !sosireTime) return null;
  const combine = (d: Date, t: string) => {
    const [h, m] = t.split(':').map(Number);
    const r = new Date(d); r.setHours(h, m, 0, 0); return r;
  };
  return combine(sosireDate, sosireTime) > combine(plecareDate, plecareTime)
    ? null : { sosireBeforePlecare: true };
}

@Component({
  selector: 'app-transport',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ReactiveFormsModule,
    MatIconModule, MatButtonModule, MatTabsModule,
    MatFormFieldModule, MatInputModule, MatSelectModule,
    MatCardModule, MatDividerModule, MatTooltipModule,
    MatChipsModule, MatSnackBarModule,
    MatDatepickerModule, MatAutocompleteModule
  ],
  templateUrl: './transport.component.html',
  styleUrl: './transport.component.scss'
})
export class TransportComponent implements OnInit {
  showModal = signal(false);
  editingId = signal<string | null>(null);
  form: FormGroup;

  eligibleOrders = computed<Order[]>(() => {
    const active = this.transportService.transports().filter(t => t.status !== 'livrat');
    const assignedIds = new Set(active.flatMap(t => t.orderIds));
    return this.ordersService.orders()
      .filter(o => o.status === 'acceptat' && !assignedIds.has(o.id) && !o.superseded);
  });

  // ── Timeline ───────────────────────────────────────────────────────────────

  timeline = computed<TimelineData | null>(() => {
    const active = this.transportService.active();
    if (!active.length) return null;

    const times = active.flatMap(t => [
      t.oraPlecare ? new Date(t.oraPlecare).getTime() : NaN,
      t.oraSosire  ? new Date(t.oraSosire).getTime()  : NaN
    ]).filter(t => !isNaN(t));
    if (!times.length) return null;

    const padding = 30 * 60 * 1000;
    const start = Math.min(...times) - padding;
    const end   = Math.max(...times) + padding;
    const range = end - start;
    const multiDay = range > 86_400_000;

    // Hour ticks
    const hours = range / 3_600_000;
    const tickH = hours < 3 ? 0.5 : hours < 12 ? 1 : hours < 48 ? 3 : 6;
    const tickMs = tickH * 3_600_000;
    const firstTick = Math.ceil(start / tickMs) * tickMs;
    const ticks: TimelineData['ticks'] = [];
    for (let t = firstTick; t <= end; t += tickMs) {
      const d = new Date(t);
      const isMidnight = d.getHours() === 0 && d.getMinutes() === 0;
      const label = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      ticks.push({ label, left: ((t - start) / range) * 100, major: isMidnight });
    }

    // Date header ticks (always shown — shows day name for each date segment)
    const DAY = ['Dum', 'Lun', 'Mar', 'Mie', 'Joi', 'Vin', 'Sâm'];
    const dateTicks: TimelineData['dateTicks'] = [];
    const dayMs = 86_400_000;
    const startDay = new Date(start); startDay.setHours(0, 0, 0, 0);
    for (let d = startDay.getTime(); d < end; d += dayMs) {
      const dayStart = Math.max(d, start);
      const dayEnd   = Math.min(d + dayMs, end);
      if (dayEnd <= start || dayStart >= end) continue;
      const date = new Date(d);
      dateTicks.push({
        label: `${DAY[date.getDay()]} ${date.getDate()}/${date.getMonth() + 1}`,
        left:  ((dayStart - start) / range) * 100,
        width: ((dayEnd - dayStart) / range) * 100
      });
    }

    // Reuse the already-computed overlapIds signal
    const overlapIds = this.overlapIds();

    // Group by vehicle for the chart rows
    const vehicleMap = new Map<string, Transport[]>();
    active.forEach(t => { vehicleMap.set(t.vehicleId, [...(vehicleMap.get(t.vehicleId) ?? []), t]); });

    // Vehicle rows
    const vehicles: TimelineRow[] = [...vehicleMap.entries()].map(([vid, trips]) => {
      const v = this.transportService.getVehicle(vid);
      return {
        id: vid,
        vehicleName: v ? (v.alias || v.denumire) : '—',
        plateName:   v?.numarInmatriculare ?? '',
        bars: trips.map(t => {
          const pT = new Date(t.oraPlecare).getTime();
          const sT = new Date(t.oraSosire).getTime();
          const driver = this.transportService.getDriver(t.driverId);
          const orders = t.orderIds.map(id => this.getOrder(id)).filter((o): o is Order => !!o);
          const destination = orders.map(o => o.client.address || o.client.name).filter(Boolean).slice(0, 2).join(' · ');
          const barLeft  = ((pT - start) / range) * 100;
          const barRight = ((sT - start) / range) * 100;
          const retRight = ((effectiveEndMs(pT, sT) - start) / range) * 100;
          return {
            id: t.id,
            left:        barLeft,
            width:       Math.max(barRight - barLeft, 1.5),
            returnLeft:  barRight,
            returnWidth: Math.max(Math.min(retRight, 100) - barRight, 0),
            status: t.status,
            orders: orders.map(o => `#${o.orderNumber}`).join(', '),
            driverName: driver?.nume ?? '—',
            destination,
            tooltip: [
              `Șofer: ${driver?.nume ?? '—'}`,
              `Plecare: ${this.transportService.formatDateTime(t.oraPlecare)}`,
              `Sosire:  ${this.transportService.formatDateTime(t.oraSosire)}`,
              `Comenzi: ${orders.map(o => `#${o.orderNumber} – ${o.client.name}`).join(', ')}`,
              destination ? `Dest: ${destination}` : ''
            ].filter(Boolean).join('\n'),
            overlap: overlapIds.has(t.id)
          };
        })
      };
    });

    return { start, end, range, multiDay, dateTicks, ticks, vehicles };
  });

  nowLeft = computed<number>(() => {
    const tl = this.timeline();
    if (!tl) return -1;
    const now = Date.now();
    if (now < tl.start || now > tl.end) return -1;
    return ((now - tl.start) / tl.range) * 100;
  });

  overlapIds = computed<Set<string>>(() => {
    const active = this.transportService.active();
    const result = new Set<string>();
    const check = (map: Map<string, Transport[]>) => map.forEach(trips => {
      for (let i = 0; i < trips.length; i++) {
        for (let j = i + 1; j < trips.length; j++) {
          const a = trips[i], b = trips[j];
          const pA = new Date(a.oraPlecare).getTime(), sA = new Date(a.oraSosire).getTime();
          const pB = new Date(b.oraPlecare).getTime(), sB = new Date(b.oraSosire).getTime();
          const eA = effectiveEndMs(pA, sA);
          const eB = effectiveEndMs(pB, sB);
          if (pA < eB && pB < eA) { result.add(a.id); result.add(b.id); }
        }
      }
    });
    const vm = new Map<string, Transport[]>();
    active.forEach(t => vm.set(t.vehicleId, [...(vm.get(t.vehicleId) ?? []), t]));
    check(vm);
    const dm = new Map<string, Transport[]>();
    active.forEach(t => dm.set(t.driverId,   [...(dm.get(t.driverId)   ?? []), t]));
    check(dm);
    return result;
  });

  hasTimelineOverlap = computed<boolean>(() => this.overlapIds().size > 0);

  // ── Constructor ───────────────────────────────────────────────────────────

  constructor(
    private fb: FormBuilder,
    public transportService: TransportService,
    public ordersService: OrdersService,
    public auth: AuthService,
    private snackBar: MatSnackBar
  ) {
    this.form = this.fb.group({
      vehicleId:    ['', Validators.required],
      driverId:     ['', Validators.required],
      orderIds:     [[], Validators.required],
      plecareDate:  [null as Date | null, Validators.required],
      plecareTime:  ['', Validators.required],
      sosireDate:   [null as Date | null, Validators.required],
      sosireTime:   ['', Validators.required],
      helper:       ['']
    }, { validators: [plecareNotInPast, sosireAfterPlecare] });
  }

  ngOnInit(): void {}

  // ── Modal ─────────────────────────────────────────────────────────────────

  openCreate(): void {
    this.editingId.set(null);
    this.form.reset({
      vehicleId: '', driverId: '', orderIds: [],
      plecareDate: null, plecareTime: '',
      sosireDate: null,  sosireTime: '',
      helper: ''
    });
    this.showModal.set(true);
  }

  openEdit(t: Transport): void {
    this.editingId.set(t.id);
    this.form.patchValue({
      vehicleId:   t.vehicleId,
      driverId:    t.driverId,
      orderIds:    t.orderIds,
      plecareDate: t.oraPlecare ? new Date(t.oraPlecare) : null,
      plecareTime: t.oraPlecare ? this._extractTime(t.oraPlecare) : '',
      sosireDate:  t.oraSosire  ? new Date(t.oraSosire)  : null,
      sosireTime:  t.oraSosire  ? this._extractTime(t.oraSosire)  : '',
      helper:      t.helper ?? ''
    });
    this.showModal.set(true);
  }

  private _extractTime(iso: string): string {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  private _combineDateTime(date: Date | null, time: string): string {
    if (!date || !time) return '';
    const [h, m] = time.split(':').map(Number);
    const result = new Date(date);
    result.setHours(h, m, 0, 0);
    return result.toISOString();
  }

  private _checkOverlap(plecare: string, sosire: string, vehicleId: string, driverId: string, excludeId?: string)
    : { vehicle: boolean; driver: boolean } {
    const pA = new Date(plecare).getTime();
    const sA = new Date(sosire).getTime();
    const eA = effectiveEndMs(pA, sA);
    const others = this.transportService.transports()
      .filter(t => t.status !== 'livrat' && t.id !== excludeId);
    let vehicle = false, driver = false;
    for (const t of others) {
      const pB = new Date(t.oraPlecare).getTime();
      const sB = new Date(t.oraSosire).getTime();
      const eB = effectiveEndMs(pB, sB);
      if (pA < eB && pB < eA) {
        if (t.vehicleId === vehicleId) vehicle = true;
        if (t.driverId === driverId)   driver  = true;
      }
    }
    return { vehicle, driver };
  }

  closeModal(): void { this.showModal.set(false); }

  save(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      if (this.form.hasError('plecareInPast')) {
        this.snackBar.open('Ora de plecare nu poate fi în trecut.', '', { duration: 3500 });
      } else if (this.form.hasError('sosireBeforePlecare')) {
        this.snackBar.open('Data/ora de sosire trebuie să fie după plecare.', '', { duration: 3000 });
      }
      return;
    }
    const val = this.form.value;
    if (!val.orderIds?.length) {
      this.snackBar.open('Selectează cel puțin o comandă.', '', { duration: 2500 });
      return;
    }

    const oraPlecare = this._combineDateTime(val.plecareDate, val.plecareTime);
    const oraSosire  = this._combineDateTime(val.sosireDate,  val.sosireTime);
    const editId     = this.editingId() ?? undefined;
    const overlap    = this._checkOverlap(oraPlecare, oraSosire, val.vehicleId, val.driverId, editId);

    if (overlap.vehicle || overlap.driver) {
      const who = overlap.vehicle && overlap.driver ? 'Mașina și șoferul'
        : overlap.vehicle ? 'Mașina' : 'Șoferul';
      this.snackBar.open(
        `${who} nu este disponibil în această perioadă (ținând cont și de timpul de întoarcere).`,
        'OK', { duration: 5000 });
      return;
    }

    const helperName = (val.helper ?? '').trim() || undefined;
    if (helperName && this.busyDriverNamesInForm.has(helperName)) {
      this.snackBar.open(
        `${helperName} este deja în cursă în această perioadă. Alege altă persoană.`,
        'OK', { duration: 5000 });
      return;
    }

    const payload = {
      vehicleId: val.vehicleId, driverId: val.driverId, orderIds: val.orderIds,
      oraPlecare, oraSosire,
      helper: helperName
    };

    if (editId) {
      this.transportService.updateTransport(editId, payload);
      this.snackBar.open('Cursa actualizată.', '', { duration: 2000 });
    } else {
      this.transportService.createTransport(payload);
      val.orderIds.forEach((oid: string) => this.ordersService.updateOrderStatus(oid, 'planificat'));
      this.snackBar.open('Cursă planificată.', '', { duration: 2000 });
    }
    this.showModal.set(false);
  }

  deleteTransport(t: Transport): void {
    if (!confirm('Ștergi această cursă? Comenzile vor reveni la statusul "Acceptat".')) return;
    t.orderIds.forEach(oid => this.ordersService.updateOrderStatus(oid, 'acceptat'));
    this.transportService.deleteTransport(t.id);
    this.snackBar.open('Cursa a fost ștearsă.', '', { duration: 2000 });
  }

  // ── Status actions ────────────────────────────────────────────────────────

  setTripStatus(t: Transport, status: TransportStatus): void {
    if (status === t.status) return;
    // livrat is only reachable from in_livrare
    if (status === 'livrat' && t.status !== 'in_livrare') return;
    if (status === 'livrat' && !confirm('Sigur s-a livrat? Cursa va fi marcată ca finalizată.')) return;
    this.transportService.setStatus(t.id, status);
    t.orderIds.forEach(oid => this.ordersService.updateOrderStatus(oid, status));
    const msg = status === 'in_livrare' ? 'Cursa a pornit!'
      : status === 'planificat' ? 'Cursă repusă pe Planificat.'
      : 'Livrare finalizată!';
    this.snackBar.open(msg, '', { duration: 2200 });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  getOrder(id: string): Order | undefined {
    return this.ordersService.orders().find(o => o.id === id);
  }

  mapsLink(address: string): string {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  }

  statusLabel(s: string): string {
    return s === 'planificat' ? 'Planificat' : s === 'in_livrare' ? 'În livrare' : 'Livrat';
  }

  statusClass(s: string): string {
    return s === 'planificat' ? 'status-planned' : s === 'in_livrare' ? 'status-active' : 'status-done';
  }

  ordersForTransport(t: Transport): (Order | undefined)[] {
    return t.orderIds.map(id => this.getOrder(id));
  }

  get selectedOrderIds(): string[] {
    return this.form.get('orderIds')?.value ?? [];
  }

  private _busyInForm(): { vehicleIds: Set<string>; driverIds: Set<string> } {
    const pd = this.form.get('plecareDate')?.value as Date | null;
    const pt = this.form.get('plecareTime')?.value as string;
    const sd = this.form.get('sosireDate')?.value as Date | null;
    const st = this.form.get('sosireTime')?.value as string;
    if (!pd || !pt || !sd || !st) return { vehicleIds: new Set(), driverIds: new Set() };
    const plecare = this._combineDateTime(pd, pt);
    const sosire  = this._combineDateTime(sd, st);
    if (!plecare || !sosire) return { vehicleIds: new Set(), driverIds: new Set() };
    const pA = new Date(plecare).getTime();
    const sA = new Date(sosire).getTime();
    const eA = effectiveEndMs(pA, sA);
    const editId = this.editingId();
    const vehicleIds = new Set<string>();
    const driverIds  = new Set<string>();
    this.transportService.active()
      .filter(t => t.id !== editId)
      .forEach(t => {
        const pB = new Date(t.oraPlecare).getTime();
        const sB = new Date(t.oraSosire).getTime();
        const eB = effectiveEndMs(pB, sB);
        if (pA < eB && pB < eA) { vehicleIds.add(t.vehicleId); driverIds.add(t.driverId); }
      });
    return { vehicleIds, driverIds };
  }

  get busyVehicleIdsInForm(): Set<string> { return this._busyInForm().vehicleIds; }
  get busyDriverIdsInForm():  Set<string> { return this._busyInForm().driverIds; }

  get selectedVehicle()     { const id = this.form.get('vehicleId')?.value; return id ? this.transportService.getVehicle(id) : undefined; }
  get selectedVehicleBusy() { const id = this.form.get('vehicleId')?.value; return id ? this.busyVehicleIdsInForm.has(id) : false; }
  get selectedDriver()      { const id = this.form.get('driverId')?.value;  return id ? this.transportService.getDriver(id)  : undefined; }
  get selectedDriverBusy()  { const id = this.form.get('driverId')?.value;  return id ? this.busyDriverIdsInForm.has(id)  : false; }
  get selectedHelperBusy()  { const n = (this.form.get('helper')?.value ?? '').trim(); return n ? this.busyDriverNamesInForm.has(n) : false; }

  get busyDriverNamesInForm(): Set<string> {
    const ids = this.busyDriverIdsInForm;
    const names = new Set<string>();
    this.transportService.drivers()
      .filter(d => ids.has(d.id))
      .forEach(d => names.add(d.nume));
    return names;
  }

  /** True when the helper on a trip is a driver concurrently busy on another trip */
  isHelperBusy(t: Transport): boolean {
    if (!t.helper) return false;
    const driver = this.transportService.drivers().find(d => d.nume === t.helper);
    if (!driver) return false;
    const pA = new Date(t.oraPlecare).getTime();
    const sA = new Date(t.oraSosire).getTime();
    const eA = effectiveEndMs(pA, sA);
    return this.transportService.active()
      .filter(other => other.id !== t.id && other.driverId === driver.id)
      .some(other => {
        const pB = new Date(other.oraPlecare).getTime();
        const sB = new Date(other.oraSosire).getTime();
        const eB = effectiveEndMs(pB, sB);
        return pA < eB && pB < eA;
      });
  }

  selectedHelpers(): { orderNum: number | undefined; helper: string }[] {
    return this.selectedOrderIds
      .map(id => this.getOrder(id))
      .filter((o): o is Order => !!o && !!o.helper)
      .map(o => ({ orderNum: o.orderNumber, helper: o.helper! }));
  }

  eligibleForEdit = computed<Order[]>(() => {
    const editId = this.editingId();
    if (!editId) return this.eligibleOrders();
    const current = this.transportService.getTransport(editId);
    const currentOrders = (current?.orderIds ?? [])
      .map(id => this.getOrder(id)).filter((o): o is Order => !!o);
    const combined = [...currentOrders, ...this.eligibleOrders()];
    const seen = new Set<string>();
    return combined.filter(o => { if (seen.has(o.id)) return false; seen.add(o.id); return true; });
  });
}
