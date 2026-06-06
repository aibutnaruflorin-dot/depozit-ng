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
import { provideNativeDateAdapter } from '@angular/material/core';
import { TransportService } from '../../core/services/transport.service';
import { OrdersService } from '../../core/services/orders.service';
import { AuthService } from '../../core/services/auth.service';
import { Transport, TransportStatus, TripDelivery } from '../../core/models/transport.model';
import { Order } from '../../core/models/order.model';
import { DragModalDirective } from '../../shared/drag-modal.directive';

// ── Validators ────────────────────────────────────────────────────────────────

function plecareNotInPast(g: AbstractControl): ValidationErrors | null {
  const pd = g.get('plecareDate')?.value as Date | null;
  const pt = g.get('plecareTime')?.value as string;
  if (!pd || !pt) return null;
  const [h, m] = pt.split(':').map(Number);
  const dt = new Date(pd); dt.setHours(h, m, 0, 0);
  return dt < new Date() ? { plecareInPast: true } : null;
}

function sosireAfterPlecare(g: AbstractControl): ValidationErrors | null {
  const pd = g.get('plecareDate')?.value as Date | null;
  const pt = g.get('plecareTime')?.value as string;
  const sd = g.get('sosireDate')?.value as Date | null;
  const st = g.get('sosireTime')?.value as string;
  if (!pd || !pt || !sd || !st) return null;
  const plecare = combineDateTime(pd, pt);
  const sosire  = combineDateTime(sd, st);
  return sosire && plecare && sosire <= plecare ? { sosireBeforePlecare: true } : null;
}

function combineDateTime(date: Date | null, time: string): string {
  if (!date || !time) return '';
  const [h, m] = time.split(':').map(Number);
  const r = new Date(date); r.setHours(h, m, 0, 0);
  return r.toISOString();
}

function effectiveEndMs(plecare: number, sosire: number): number {
  const duration = sosire - plecare;
  return sosire + Math.min(duration * 0.5, 2 * 3600_000);
}

// ── Calendar types ─────────────────────────────────────────────────────────────

interface CalDay {
  date: Date;
  isoDate: string;
  isToday: boolean;
  dayName: string;
  dateStr: string;
  dayStart: number; // ms timestamp at CAL_START_HOUR
  dayEnd: number;   // ms timestamp at CAL_END_HOUR
}

interface CalBar {
  transport: Transport;
  leftPct: number;
  widthPct: number;
}

// ── Component ─────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-transport',
  standalone: true,
  providers: [provideNativeDateAdapter()],
  imports: [
    CommonModule, FormsModule, ReactiveFormsModule,
    MatIconModule, MatButtonModule, MatTabsModule,
    MatFormFieldModule, MatInputModule, MatSelectModule,
    MatCardModule, MatDividerModule, MatTooltipModule,
    MatChipsModule, MatSnackBarModule,
    MatDatepickerModule, MatAutocompleteModule,
    DragModalDirective
  ],
  templateUrl: './transport.component.html',
  styleUrl: './transport.component.scss'
})
export class TransportComponent implements OnInit {

  readonly CAL_START_HOUR = 6;
  readonly CAL_END_HOUR   = 22;
  readonly CAL_HOURS = Array.from({ length: this.CAL_END_HOUR - this.CAL_START_HOUR + 1 }, (_, i) => {
    const h = i + this.CAL_START_HOUR;
    return { hour: h, label: `${h}:00`, pct: (i / (this.CAL_END_HOUR - this.CAL_START_HOUR)) * 100 };
  });
  readonly today = new Date();

  layoutMode  = signal<1|2|3>(1);
  showHistoric = signal(false);
  showCalendar = signal(false);

  showModal = signal(false);
  editingId = signal<string | null>(null);

  // ── Modal state (article-level selection) ─────────────────────────────────
  modalOrders = signal<Order[]>([]);
  modalQty    = signal<Record<string, Record<number, number>>>({});
  orderSearch = signal('');

  form: FormGroup;

  // ── Computed ──────────────────────────────────────────────────────────────

  planningDays = computed<CalDay[]>(() => {
    const days: CalDay[] = [];
    const base = new Date(); base.setHours(0, 0, 0, 0);
    for (let i = 0; i < 5; i++) {
      const d = new Date(base); d.setDate(d.getDate() + i);
      const dayStart = d.getTime() + this.CAL_START_HOUR * 3_600_000;
      const dayEnd   = d.getTime() + this.CAL_END_HOUR   * 3_600_000;
      days.push({
        date: d,
        isoDate: d.toISOString().slice(0, 10),
        isToday: i === 0,
        dayName: d.toLocaleDateString('ro-RO', { weekday: 'short' }).replace('.', ''),
        dateStr: d.toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit' }),
        dayStart, dayEnd
      });
    }
    return days;
  });

  deliveryOrders = computed<Order[]>(() => {
    const assignedIds = this._activeAssignedOrderIds();
    return this.ordersService.orders()
      .filter(o => {
        if (!o.cuLivrare || o.superseded) return false;
        if (!['acceptat', 'livrat_partial'].includes(o.status)) return false;
        if (assignedIds.has(o.id)) return false;
        return this._hasRemainingItems(o);
      })
      .sort((a, b) => (a.deliveryDate ?? a.timestamp).localeCompare(b.deliveryDate ?? b.timestamp));
  });

  eligibleOrders = computed<Order[]>(() => {
    const assignedIds = this._activeAssignedOrderIds();
    return this.ordersService.orders().filter(o => {
      if (!o.cuLivrare || o.superseded) return false;
      if (!['acceptat', 'livrat_partial', 'planificat'].includes(o.status)) return false;
      if (assignedIds.has(o.id)) return false;
      return this._hasRemainingItems(o);
    });
  });

  eligibleForEdit = computed<Order[]>(() => {
    const editId = this.editingId();
    if (!editId) return this.eligibleOrders();
    const current = this.transportService.getTransport(editId);
    const currentIds = new Set(current?.deliveries.map(d => d.orderId) ?? []);
    const currentOrders = [...currentIds]
      .map(id => this.getOrder(id)).filter((o): o is Order => !!o);
    const others = this.eligibleOrders().filter(o => !currentIds.has(o.id));
    const combined = [...currentOrders, ...others];
    const seen = new Set<string>();
    return combined.filter(o => { if (seen.has(o.id)) return false; seen.add(o.id); return true; });
  });

  filteredEligible = computed<Order[]>(() => {
    const q = this.orderSearch().toLowerCase().trim();
    const alreadyAdded = new Set(this.modalOrders().map(o => o.id));
    return this.eligibleForEdit()
      .filter(o => !alreadyAdded.has(o.id))
      .filter(o => !q
        || o.client.name.toLowerCase().includes(q)
        || String(o.orderNumber).includes(q)
        || (o.client.address ?? '').toLowerCase().includes(q)
      );
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
          const eA = effectiveEndMs(pA, sA), eB = effectiveEndMs(pB, sB);
          if (pA < eB && pB < eA) { result.add(a.id); result.add(b.id); }
        }
      }
    });
    const vm = new Map<string, Transport[]>();
    active.forEach(t => vm.set(t.vehicleId, [...(vm.get(t.vehicleId) ?? []), t]));
    check(vm);
    const dm = new Map<string, Transport[]>();
    active.forEach(t => dm.set(t.driverId, [...(dm.get(t.driverId) ?? []), t]));
    check(dm);
    return result;
  });

  // ── Constructor ───────────────────────────────────────────────────────────

  constructor(
    private fb: FormBuilder,
    public  transportService: TransportService,
    public  ordersService: OrdersService,
    public  auth: AuthService,
    private snackBar: MatSnackBar
  ) {
    this.form = this.fb.group({
      vehicleId:   ['', Validators.required],
      driverId:    ['', Validators.required],
      plecareDate: [null as Date | null, Validators.required],
      plecareTime: ['', Validators.required],
      sosireDate:  [null as Date | null, Validators.required],
      sosireTime:  ['', Validators.required],
      helper:      ['']
    }, { validators: [plecareNotInPast, sosireAfterPlecare] });
  }

  ngOnInit(): void {}

  // ── Modal open/close ──────────────────────────────────────────────────────

  openCreate(): void {
    this.editingId.set(null);
    this._resetModal();
    this.form.reset({ vehicleId: '', driverId: '', plecareDate: null, plecareTime: '', sosireDate: null, sosireTime: '', helper: '' });
    this.showModal.set(true);
  }

  openCreateForOrder(order: Order): void {
    this.openCreate();
    this.addOrderToModal(order);
  }

  openCreateForVehicleDay(vehicleId: string, day: CalDay): void {
    this.editingId.set(null);
    this._resetModal();
    this.form.reset({
      vehicleId,
      driverId:    '',
      plecareDate: day.date,
      plecareTime: '08:00',
      sosireDate:  day.date,
      sosireTime:  '12:00',
      helper: ''
    });
    this.showModal.set(true);
  }

  openEdit(t: Transport): void {
    this.editingId.set(t.id);
    this._resetModal();

    const orders = t.deliveries.map(d => this.getOrder(d.orderId)).filter((o): o is Order => !!o);
    this.modalOrders.set(orders);

    const qty: Record<string, Record<number, number>> = {};
    for (const d of t.deliveries) {
      qty[d.orderId] = {};
      for (const item of d.items) qty[d.orderId][item.productIndex] = item.qty;
    }
    this.modalQty.set(qty);

    this.form.patchValue({
      vehicleId:   t.vehicleId,
      driverId:    t.driverId,
      plecareDate: t.oraPlecare ? new Date(t.oraPlecare) : null,
      plecareTime: t.oraPlecare ? this._extractTime(t.oraPlecare) : '',
      sosireDate:  t.oraSosire  ? new Date(t.oraSosire)  : null,
      sosireTime:  t.oraSosire  ? this._extractTime(t.oraSosire)  : '',
      helper:      t.helper ?? ''
    });
    this.showModal.set(true);
  }

  closeModal(): void { this.showModal.set(false); }

  // ── Article selection in modal ────────────────────────────────────────────

  addOrderToModal(order: Order): void {
    if (this.modalOrders().some(o => o.id === order.id)) return;
    this.modalOrders.update(list => [...list, order]);
    const remaining = this.getRemainingQtyArr(order);
    this.modalQty.update(m => ({
      ...m,
      [order.id]: Object.fromEntries(remaining.map((q, i) => [i, q]))
    }));
    this.orderSearch.set('');
  }

  removeOrderFromModal(orderId: string): void {
    this.modalOrders.update(list => list.filter(o => o.id !== orderId));
    this.modalQty.update(m => { const n = { ...m }; delete n[orderId]; return n; });
  }

  getModalQty(orderId: string, idx: number): number {
    return this.modalQty()[orderId]?.[idx] ?? 0;
  }

  setModalQty(orderId: string, idx: number, val: string | number): void {
    const order = this.modalOrders().find(o => o.id === orderId);
    if (!order) return;
    const max = this.getRemainingQtyArr(order)[idx] ?? 0;
    const qty = Math.min(max, Math.max(0, parseInt(String(val)) || 0));
    this.modalQty.update(m => ({ ...m, [orderId]: { ...(m[orderId] ?? {}), [idx]: qty } }));
  }

  modalOrderTotalQty(orderId: string, order: Order): number {
    return order.products.reduce((s, _, i) => s + this.getModalQty(orderId, i), 0);
  }

  // ── Delivered / remaining qty ─────────────────────────────────────────────

  getDeliveredQtyArr(order: Order): number[] {
    const qty = new Array(order.products.length).fill(0);
    for (const t of this.transportService.transports()) {
      if (t.status !== 'livrat') continue;
      const d = t.deliveries.find(d => d.orderId === order.id);
      if (!d) continue;
      for (const item of d.items) {
        if (item.productIndex < qty.length) qty[item.productIndex] += item.qty;
      }
    }
    return qty;
  }

  getRemainingQtyArr(order: Order): number[] {
    const del = this.getDeliveredQtyArr(order);
    return order.products.map((p, i) => Math.max(0, p.qty - (del[i] || 0)));
  }

  totalQty(order: Order): number {
    return order.products.reduce((s, p) => s + p.qty, 0);
  }

  deliveredTotal(order: Order): number {
    return this.getDeliveredQtyArr(order).reduce((s, q) => s + q, 0);
  }

  remainingTotal(order: Order): number {
    return this.getRemainingQtyArr(order).reduce((s, q) => s + q, 0);
  }

  // ── Save ──────────────────────────────────────────────────────────────────

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
    if (this.modalOrders().length === 0) {
      this.snackBar.open('Adaugă cel puțin o comandă la cursă.', '', { duration: 2500 });
      return;
    }

    const deliveries: TripDelivery[] = this.modalOrders()
      .map(order => ({
        orderId: order.id,
        items: order.products
          .map((_, i) => ({ productIndex: i, qty: this.getModalQty(order.id, i) }))
          .filter(item => item.qty > 0)
      }))
      .filter(d => d.items.length > 0);

    if (deliveries.length === 0) {
      this.snackBar.open('Setează cel puțin o cantitate > 0 pentru un produs.', '', { duration: 2500 });
      return;
    }

    const val        = this.form.value;
    const oraPlecare = combineDateTime(val.plecareDate, val.plecareTime);
    const oraSosire  = combineDateTime(val.sosireDate,  val.sosireTime);
    const editId     = this.editingId() ?? undefined;
    const overlap    = this._checkOverlap(oraPlecare, oraSosire, val.vehicleId, val.driverId, editId);

    if (overlap.vehicle || overlap.driver) {
      const who = overlap.vehicle && overlap.driver ? 'Mașina și șoferul'
        : overlap.vehicle ? 'Mașina' : 'Șoferul';
      this.snackBar.open(`${who} nu este disponibil în această perioadă.`, 'OK', { duration: 5000 });
      return;
    }

    const helperName = (val.helper ?? '').trim() || undefined;
    if (helperName && this.busyDriverNamesInForm.has(helperName)) {
      this.snackBar.open(`${helperName} este deja în cursă. Alege altă persoană.`, 'OK', { duration: 5000 });
      return;
    }

    const payload = { vehicleId: val.vehicleId, driverId: val.driverId, deliveries, oraPlecare, oraSosire, helper: helperName };

    if (editId) {
      this.transportService.updateTransport(editId, payload);
      this.snackBar.open('Cursa actualizată.', '', { duration: 2000 });
    } else {
      this.transportService.createTransport(payload);
      for (const d of deliveries) {
        this.ordersService.updateOrderStatus(d.orderId, 'planificat');
      }
      this.snackBar.open('Cursă planificată.', '', { duration: 2000 });
    }
    this.showModal.set(false);
  }

  // ── Status transitions ────────────────────────────────────────────────────

  setTripStatus(t: Transport, status: TransportStatus): void {
    if (status === t.status) return;
    if (status === 'livrat' && t.status !== 'in_livrare') return;
    if (status === 'livrat' && !confirm('Sigur s-a livrat? Cursa va fi marcată finalizată.')) return;

    this.transportService.setStatus(t.id, status);

    if (status === 'livrat') {
      const affected = new Set(t.deliveries.map(d => d.orderId));
      for (const orderId of affected) {
        const order = this.getOrder(orderId);
        if (!order) continue;
        // transportService.setStatus already updated the signal, so getDeliveredQtyArr sees this trip as 'livrat'
        this.ordersService.updateDeliveryState(orderId, this.getDeliveredQtyArr(order));
      }
    }

    const msg = status === 'in_livrare' ? 'Cursa a pornit!'
      : status === 'planificat' ? 'Cursă repusă pe Planificat.'
      : 'Livrare finalizată!';
    this.snackBar.open(msg, '', { duration: 2200 });
  }

  deleteTransport(t: Transport): void {
    if (!confirm('Ștergi această cursă? Comenzile vor reveni la statusul anterior.')) return;
    const affected = [...new Set(t.deliveries.map(d => d.orderId))];
    this.transportService.deleteTransport(t.id);
    for (const orderId of affected) {
      const order = this.getOrder(orderId);
      if (!order) continue;
      const del = this.getDeliveredQtyArr(order);
      const hasAny = del.some(q => q > 0);
      if (hasAny) {
        this.ordersService.updateDeliveryState(orderId, del);
      } else {
        this.ordersService.updateOrderStatus(orderId, 'acceptat');
      }
    }
    this.snackBar.open('Cursa a fost ștearsă.', '', { duration: 2000 });
  }

  // ── Calendar helpers ──────────────────────────────────────────────────────

  tripsForVehicleDay(vehicleId: string, day: CalDay): CalBar[] {
    const { dayStart, dayEnd } = day;
    const duration = dayEnd - dayStart;
    return this.transportService.transports()
      .filter(t => t.vehicleId === vehicleId && t.status !== 'livrat')
      .filter(t => {
        const pT = new Date(t.oraPlecare).getTime();
        const sT = new Date(t.oraSosire).getTime();
        return pT < dayEnd && sT > dayStart;
      })
      .map(t => {
        const pT = Math.max(new Date(t.oraPlecare).getTime(), dayStart);
        const sT = Math.min(new Date(t.oraSosire).getTime(), dayEnd);
        return {
          transport: t,
          leftPct:  Math.max(0, ((pT - dayStart) / duration) * 100),
          widthPct: Math.max(1, ((sT - pT) / duration) * 100)
        };
      });
  }

  calBarLabel(bar: CalBar): string {
    const orders = [...new Set(bar.transport.deliveries.map(d => d.orderId))]
      .map(id => this.getOrder(id)).filter((o): o is Order => !!o);
    return orders.map(o => `#${o.orderNumber} ${o.client.name}`).join(' · ') || '—';
  }

  calBarTooltip(bar: CalBar): string {
    const t = bar.transport;
    const driver = this.transportService.getDriver(t.driverId);
    const orders = [...new Set(t.deliveries.map(d => d.orderId))]
      .map(id => this.getOrder(id)).filter((o): o is Order => !!o);
    return [
      `Șofer: ${driver?.nume ?? '—'}`,
      `Plecare: ${this.transportService.formatDateTime(t.oraPlecare)}`,
      `Sosire:  ${this.transportService.formatDateTime(t.oraSosire)}`,
      orders.map(o => `#${o.orderNumber} – ${o.client.name}`).join('\n')
    ].join('\n');
  }

  // ── Generic helpers ───────────────────────────────────────────────────────

  getOrder(id: string): Order | undefined {
    return this.ordersService.orders().find(o => o.id === id);
  }

  ordersForTransport(t: Transport): Order[] {
    return [...new Set(t.deliveries.map(d => d.orderId))]
      .map(id => this.getOrder(id)).filter((o): o is Order => !!o);
  }

  selectedHelpers(): { orderNum: number | undefined; helper: string }[] {
    return this.modalOrders()
      .filter(o => !!o.helper)
      .map(o => ({ orderNum: o.orderNumber, helper: o.helper! }));
  }

  getVehicleName(id: string): string {
    const v = this.transportService.getVehicle(id);
    return v ? (v.alias || v.denumire) : '—';
  }

  getDriverName(id: string): string {
    return this.transportService.getDriver(id)?.nume ?? '—';
  }

  formatTime(iso: string): string {
    if (!iso) return '—';
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
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

  isHelperBusy(t: Transport): boolean {
    if (!t.helper) return false;
    const driver = this.transportService.drivers().find(d => d.nume === t.helper);
    if (!driver) return false;
    const pA = new Date(t.oraPlecare).getTime(), sA = new Date(t.oraSosire).getTime();
    const eA = effectiveEndMs(pA, sA);
    return this.transportService.active()
      .filter(other => other.id !== t.id && other.driverId === driver.id)
      .some(other => {
        const pB = new Date(other.oraPlecare).getTime(), sB = new Date(other.oraSosire).getTime();
        return pA < effectiveEndMs(pB, sB) && pB < eA;
      });
  }

  get busyVehicleIdsInForm(): Set<string> { return this._busyInForm().vehicleIds; }
  get busyDriverIdsInForm():  Set<string> { return this._busyInForm().driverIds; }
  get selectedVehicle()      { const id = this.form.get('vehicleId')?.value; return id ? this.transportService.getVehicle(id) : undefined; }
  get selectedVehicleBusy()  { const id = this.form.get('vehicleId')?.value; return id ? this.busyVehicleIdsInForm.has(id) : false; }
  get selectedDriver()       { const id = this.form.get('driverId')?.value;  return id ? this.transportService.getDriver(id)  : undefined; }
  get selectedDriverBusy()   { const id = this.form.get('driverId')?.value;  return id ? this.busyDriverIdsInForm.has(id)  : false; }
  get selectedHelperBusy()   { const n = (this.form.get('helper')?.value ?? '').trim(); return n ? this.busyDriverNamesInForm.has(n) : false; }
  get busyDriverNamesInForm(): Set<string> {
    const ids = this.busyDriverIdsInForm;
    const names = new Set<string>();
    this.transportService.drivers().filter(d => ids.has(d.id)).forEach(d => names.add(d.nume));
    return names;
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private _resetModal(): void {
    this.modalOrders.set([]);
    this.modalQty.set({});
    this.orderSearch.set('');
  }

  private _hasRemainingItems(order: Order): boolean {
    const del = this.getDeliveredQtyArr(order);
    return order.products.some((p, i) => p.qty > (del[i] || 0));
  }

  private _activeAssignedOrderIds(): Set<string> {
    return new Set(
      this.transportService.transports()
        .filter(t => t.status !== 'livrat')
        .flatMap(t => t.deliveries.map(d => d.orderId))
    );
  }

  private _extractTime(iso: string): string {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  private _checkOverlap(plecare: string, sosire: string, vehicleId: string, driverId: string, excludeId?: string): { vehicle: boolean; driver: boolean } {
    const pA = new Date(plecare).getTime(), sA = new Date(sosire).getTime();
    const eA = effectiveEndMs(pA, sA);
    const others = this.transportService.transports().filter(t => t.status !== 'livrat' && t.id !== excludeId);
    let vehicle = false, driver = false;
    for (const t of others) {
      const pB = new Date(t.oraPlecare).getTime(), sB = new Date(t.oraSosire).getTime();
      const eB = effectiveEndMs(pB, sB);
      if (pA < eB && pB < eA) {
        if (t.vehicleId === vehicleId) vehicle = true;
        if (t.driverId  === driverId)  driver  = true;
      }
    }
    return { vehicle, driver };
  }

  private _busyInForm(): { vehicleIds: Set<string>; driverIds: Set<string> } {
    const pd = this.form.get('plecareDate')?.value as Date | null;
    const pt = this.form.get('plecareTime')?.value as string;
    const sd = this.form.get('sosireDate')?.value as Date | null;
    const st = this.form.get('sosireTime')?.value as string;
    if (!pd || !pt || !sd || !st) return { vehicleIds: new Set(), driverIds: new Set() };
    const plecare = combineDateTime(pd, pt), sosire = combineDateTime(sd, st);
    if (!plecare || !sosire) return { vehicleIds: new Set(), driverIds: new Set() };
    const pA = new Date(plecare).getTime(), sA = new Date(sosire).getTime();
    const eA = effectiveEndMs(pA, sA);
    const editId = this.editingId();
    const vehicleIds = new Set<string>(), driverIds = new Set<string>();
    this.transportService.active().filter(t => t.id !== editId).forEach(t => {
      const pB = new Date(t.oraPlecare).getTime(), sB = new Date(t.oraSosire).getTime();
      const eB = effectiveEndMs(pB, sB);
      if (pA < eB && pB < eA) { vehicleIds.add(t.vehicleId); driverIds.add(t.driverId); }
    });
    return { vehicleIds, driverIds };
  }
}
