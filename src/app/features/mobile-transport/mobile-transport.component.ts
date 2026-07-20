import { Component, computed, signal, effect, OnInit, WritableSignal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TransportService } from '../../core/services/transport.service';
import { OrdersService, generateId } from '../../core/services/orders.service';
import { AuthService } from '../../core/services/auth.service';
import { StorageService } from '../../core/services/storage.service';
import { CatalogsService } from '../../core/services/catalogs.service';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Transport, TripDelivery, TripOrderItem, TransportStatus } from '../../core/models/transport.model';
import { Order, OrderProduct } from '../../core/models/order.model';
import { WhatsAppContact } from '../../core/models/whatsapp.model';
import { Router } from '@angular/router';
import { MobileNavComponent } from '../../shared/mobile-nav/mobile-nav.component';
import { InitValueDirective } from '../../shared/init-textarea.directive';

interface CalDay {
  isoDate: string;
  isToday: boolean;
  dayName: string;
  dateStr: string;
}

const STATUS_STEPS: TransportStatus[] = ['planificat', 'confirmat_sofer', 'in_livrare', 'livrat'];
const STEP_LABELS = ['Planificat', 'Confirmat', 'Pornit', 'Livrat'];

@Component({
  selector: 'app-mobile-transport',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, MatSnackBarModule, MobileNavComponent, InitValueDirective],
  templateUrl: './mobile-transport.component.html',
  styleUrl: './mobile-transport.component.scss'
})

export class MobileTransportComponent implements OnInit {
  readonly STATUS_STEPS = STATUS_STEPS;
  readonly STEP_LABELS  = STEP_LABELS;

  expandedId = signal<string | null>(null);

  // Admin form
  showForm    = signal(false);
  editingId   = signal<string | null>(null);
  formVehicleId   = signal('');
  formDriverId    = signal('');
  formHelperName  = signal('');
  formPlecareDate = signal('');
  formPlecareTime = signal('08:00');
  formSosireDate  = signal('');
  formSosireTime  = signal('18:00');

  // New form state — per-order qty selection, notes, inline edit
  formLockedToOrder = signal(false);
  formModalOrders   = signal<Order[]>([]);
  formModalQty      = signal<Record<string, Record<number, number>>>({});
  formDeliveryNotes = signal<Record<string, string>>({});
  formOrderObs      = signal<Record<string, string>>({});
  editingAddrId     = signal<string | null>(null);
  addrEdit          = signal('');
  editingDeadlineId = signal<string | null>(null);
  deadlineDateEdit  = signal('');
  deadlineTimeEdit  = signal('');

  // UI toggles
  showCalendar       = signal(false);
  showPending        = signal(false);
  showOverdueOrders  = signal(true);
  showActive           = signal(true);
  showOverdueTrips     = signal(true);
  showDone             = signal(false);
  showDeleted          = signal(false);
  showDeletedOrders    = signal(false);
  showOrderHistory     = signal(false);
  expandedPendingId  = signal<string | null>(null);
  expandedHistoryIds = signal<Set<string>>(new Set());


  // WA groups
  waGroups = signal<WhatsAppContact[]>([]);

  constructor(
    public  transportService: TransportService,
    public  ordersService: OrdersService,
    public  auth: AuthService,
    private storage: StorageService,
    private catalogsService: CatalogsService,
    private snackBar: MatSnackBar,
    private router: Router
  ) {
    this._loadSectionState();
    effect(() => {
      localStorage.setItem('mt_sections', JSON.stringify({
        showCalendar:      this.showCalendar(),
        showPending:       this.showPending(),
        showOverdueOrders: this.showOverdueOrders(),
        showActive:        this.showActive(),
        showOverdueTrips:  this.showOverdueTrips(),
        showDone:          this.showDone(),
        showDeleted:       this.showDeleted(),
        showDeletedOrders: this.showDeletedOrders(),
        showOrderHistory:  this.showOrderHistory(),
      }));
    });
  }

  private _loadSectionState(): void {
    try {
      const raw = localStorage.getItem('mt_sections');
      if (!raw) return;
      const s = JSON.parse(raw);
      if (typeof s.showCalendar      === 'boolean') this.showCalendar.set(s.showCalendar);
      if (typeof s.showPending       === 'boolean') this.showPending.set(s.showPending);
      if (typeof s.showOverdueOrders === 'boolean') this.showOverdueOrders.set(s.showOverdueOrders);
      if (typeof s.showActive        === 'boolean') this.showActive.set(s.showActive);
      if (typeof s.showOverdueTrips  === 'boolean') this.showOverdueTrips.set(s.showOverdueTrips);
      if (typeof s.showDone          === 'boolean') this.showDone.set(s.showDone);
      if (typeof s.showDeleted       === 'boolean') this.showDeleted.set(s.showDeleted);
      if (typeof s.showDeletedOrders === 'boolean') this.showDeletedOrders.set(s.showDeletedOrders);
      if (typeof s.showOrderHistory  === 'boolean') this.showOrderHistory.set(s.showOrderHistory);
    } catch { /* date corupte — ignoră */ }
  }

  get todayIso(): string {
    return new Date().toISOString().slice(0, 10);
  }

  ngOnInit(): void {
    const contacts = this.storage.get<WhatsAppContact[]>('app_whatsapp_contacts') ?? [];
    this.waGroups.set(contacts.filter(c => c.type === 'group'));
  }

  // ── Core computed ─────────────────────────────────────────────────────────

  readonly active = computed(() =>
    this.transportService.transports()
      .filter(t => t.status !== 'livrat' && t.status !== 'sters')
      .sort((a, b) => a.oraPlecare.localeCompare(b.oraPlecare))
  );

  readonly done = computed(() =>
    this.transportService.transports()
      .filter(t => t.status === 'livrat')
      .sort((a, b) => b.oraPlecare.localeCompare(a.oraPlecare))
      .slice(0, 30)
  );

  readonly cancelled = computed(() =>
    this.transportService.transports().filter(t => t.status === 'anulat').length
  );

  readonly deleted = computed(() =>
    this.transportService.transports()
      .filter(t => t.status === 'sters')
      .sort((a, b) => b.oraPlecare.localeCompare(a.oraPlecare))
      .slice(0, 20)
  );

  readonly doneTotal = computed(() =>
    this.transportService.transports().filter(t => t.status === 'livrat').length
  );
  readonly deletedTotal = computed(() =>
    this.transportService.transports().filter(t => t.status === 'sters').length
  );

  readonly pendingOnTime = computed<Order[]>(() =>
    this.pendingOrders().filter(o => !this.isOrderDeadlineOverdue(o))
  );

  readonly overdueUnplannedOrders = computed<Order[]>(() =>
    this.pendingOrders().filter(o => this.isOrderDeadlineOverdue(o))
  );

  readonly plannedTrips = computed(() =>
    this.active().filter(t => !this.isOverdue(t))
  );

  readonly overdueTrips = computed(() =>
    this.active().filter(t => this.isOverdue(t))
  );

  readonly planningDays = computed<CalDay[]>(() => {
    const days: CalDay[] = [];
    const base = new Date(); base.setHours(0, 0, 0, 0);
    for (let i = 0; i < 5; i++) {
      const d = new Date(base); d.setDate(d.getDate() + i);
      days.push({
        isoDate: d.toISOString().slice(0, 10),
        isToday: i === 0,
        dayName: d.toLocaleDateString('ro-RO', { weekday: 'short' }).replace('.', ''),
        dateStr: d.toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit' }),
      });
    }
    return days;
  });

  readonly orderHistoryList = computed<Order[]>(() =>
    this.ordersService.orders()
      .filter(o => o.cuLivrare && !o.superseded && o.status !== 'anulat' && o.status !== 'sters')
      .sort((a, b) => (a.deliveryDate ?? a.timestamp).localeCompare(b.deliveryDate ?? b.timestamp))
  );

  readonly pendingOrders = computed<Order[]>(() =>
    this.ordersService.orders().filter(o => {
      if (o.status === 'sters') return false;
      if (!o.cuLivrare || o.superseded) return false;
      if (!['acceptat','livrat_partial','planificat'].includes(o.status)) return false;
      return this._hasRemainingItems(o);
    }).sort((a, b) => (a.deliveryDate ?? a.timestamp).localeCompare(b.deliveryDate ?? b.timestamp))
  );

  readonly formEligibleOrders = computed<Order[]>(() => {
    const addedIds = new Set(this.formModalOrders().map(o => o.id));
    const editId   = this.editingId();
    return this.ordersService.orders().filter(o => {
      if (o.status === 'sters') return false;
      if (o.superseded || !o.cuLivrare) return false;
      if (!['acceptat','livrat_partial','planificat'].includes(o.status)) return false;
      if (addedIds.has(o.id)) return false;
      return this._hasRemainingItems(o, editId);
    }).sort((a, b) => (a.deliveryDate ?? a.timestamp).localeCompare(b.deliveryDate ?? b.timestamp));
  });

  readonly formPlecareInPast = computed<boolean>(() => {
    const pd = this.formPlecareDate(), pt = this.formPlecareTime();
    if (!pd) return false;
    return new Date(`${pd}T${pt}:00`) < new Date();
  });

  readonly formSosireBeforePlecare = computed<boolean>(() => {
    const pd = this.formPlecareDate(), pt = this.formPlecareTime();
    const sd = this.formSosireDate(), st = this.formSosireTime();
    if (!pd || !sd) return false;
    return `${sd}T${st}:00` <= `${pd}T${pt}:00`;
  });

  readonly formHelperBusy = computed<boolean>(() => {
    const name = this.formHelperName().trim();
    if (!name) return false;
    const pd = this.formPlecareDate(), pt = this.formPlecareTime();
    const sd = this.formSosireDate(), st = this.formSosireTime();
    if (!pd || !sd) return false;
    const pA = new Date(`${pd}T${pt}:00`).getTime();
    const sA = new Date(`${sd}T${st}:00`).getTime();
    if (isNaN(pA) || isNaN(sA) || sA <= pA) return false;
    const eA = this._effectiveEndMs(pA, sA);
    const editId = this.editingId();
    return this.transportService.transports()
      .filter(t => !['livrat','anulat','sters'].includes(t.status) && t.id !== editId && t.helper === name)
      .some(t => {
        const pB = new Date(t.oraPlecare).getTime(), sB = new Date(t.oraSosire).getTime();
        return pA < this._effectiveEndMs(pB, sB) && pB < eA;
      });
  });

  readonly formHasDeadlineConflicts = computed<boolean>(() =>
    this.formModalOrders().some(o => this.formOrderDeadlineStatus(o) === 'warn')
  );

  readonly formBusyVehicleIds = computed<Set<string>>(() => {
    const pd = this.formPlecareDate(), pt = this.formPlecareTime();
    const sd = this.formSosireDate(),  st = this.formSosireTime();
    if (!pd || !sd) return new Set();
    const pA = new Date(`${pd}T${pt}:00`).getTime();
    const sA = new Date(`${sd}T${st}:00`).getTime();
    if (isNaN(pA) || isNaN(sA) || sA <= pA) return new Set();
    const eA = this._effectiveEndMs(pA, sA);
    const editId = this.editingId();
    const busy = new Set<string>();
    for (const t of this.transportService.transports()) {
      if (['livrat','anulat','sters'].includes(t.status) || t.id === editId) continue;
      const pB = new Date(t.oraPlecare).getTime(), sB = new Date(t.oraSosire).getTime();
      if (pA < this._effectiveEndMs(pB, sB) && pB < eA) busy.add(t.vehicleId);
    }
    return busy;
  });

  readonly formBusyDriverIds = computed<Set<string>>(() => {
    const pd = this.formPlecareDate(), pt = this.formPlecareTime();
    const sd = this.formSosireDate(),  st = this.formSosireTime();
    if (!pd || !sd) return new Set();
    const pA = new Date(`${pd}T${pt}:00`).getTime();
    const sA = new Date(`${sd}T${st}:00`).getTime();
    if (isNaN(pA) || isNaN(sA) || sA <= pA) return new Set();
    const eA = this._effectiveEndMs(pA, sA);
    const editId = this.editingId();
    const busy = new Set<string>();
    for (const t of this.transportService.transports()) {
      if (['livrat','anulat','sters'].includes(t.status) || t.id === editId) continue;
      const pB = new Date(t.oraPlecare).getTime(), sB = new Date(t.oraSosire).getTime();
      if (pA < this._effectiveEndMs(pB, sB) && pB < eA) busy.add(t.driverId);
    }
    return busy;
  });

  readonly formTotalWeight = computed<number>(() => {
    const qty = this.formModalQty();
    let total = 0;
    for (const order of this.formModalOrders()) {
      const oq = qty[order.id] ?? {};
      order.products.forEach((p, i) => { total += this.productMasa(p) * (oq[i] ?? 0); });
    }
    return total;
  });

  // ── Display helpers ───────────────────────────────────────────────────────

  ordersForTransport(t: Transport): Order[] {
    return [...new Set(t.deliveries.map(d => d.orderId))]
      .map(id => this.ordersService.orders().find(o => o.id === id))
      .filter((o): o is Order => !!o);
  }

  vehicleName(t: Transport): string {
    const v = this.transportService.getVehicle(t.vehicleId);
    return v?.alias || v?.denumire || t.vehicleId;
  }

  driverName(t: Transport): string {
    return this.transportService.getDriver(t.driverId)?.nume ?? t.driverId;
  }

  statusLabel(s: string): string {
    const m: Record<string, string> = {
      planificat:      'Așteptare confirmare',
      confirmat_sofer: 'Confirmat șofer',
      in_livrare:      'În livrare',
      livrat:          'Livrat',
      anulat:          'Anulat',
      sters:           'Șters'
    };
    return m[s] ?? s;
  }

  statusClass(t: Transport): string {
    if (t.status === 'in_livrare')      return 'chip-active';
    if (t.status === 'confirmat_sofer') return 'chip-confirm';
    if (t.status === 'planificat')      return 'chip-plan';
    if (t.status === 'livrat')          return 'chip-done';
    return 'chip-cancel';
  }

  isOrderDeadlineOverdue(order: Order): boolean {
    if (!order.deliveryDate) return false;
    const [y, mo, d] = order.deliveryDate.split('-').map(Number);
    const deadline = new Date(y, mo - 1, d);
    if (order.deliveryTime) {
      const [h, m] = order.deliveryTime.split(':').map(Number);
      deadline.setHours(h, m, 0, 0);
    } else {
      deadline.setHours(23, 59, 0, 0);
    }
    return Date.now() > deadline.getTime();
  }

  isOverdue(t: Transport): boolean {
    if (['livrat','anulat','sters'].includes(t.status)) return false;
    if (new Date(t.oraSosire).getTime() < Date.now()) return true;
    return this.ordersForTransport(t).some(o => this.isOrderDeadlineOverdue(o));
  }

  fmtTs(iso: string | undefined): string {
    if (!iso) return '—';
    return this.fmtDT(iso);
  }

  tripDuration(t: Transport): string {
    if (!t.startedAt || !t.completedAt) return '—';
    const ms = new Date(t.completedAt).getTime() - new Date(t.startedAt).getTime();
    if (ms <= 0) return '—';
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  tripTotalDuration(t: Transport): string {
    if (!t.completedAt) return '—';
    const ms = new Date(t.completedAt).getTime() - new Date(t.createdAt).getTime();
    if (ms <= 0) return '—';
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  fmtDT(iso: string): string {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit' }) +
        ' ' + d.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });
    } catch { return iso; }
  }

  fmtDate(iso: string): string {
    try { return new Date(iso).toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
    catch { return iso; }
  }

  productPrice(p: OrderProduct): { net: number; tva: number } {
    let net = p.pretFaraTVA ?? null;
    let tva = p.pretCuTVA ?? null;
    if ((net == null || tva == null) && p.catalogId) {
      const cp = this.catalogsService.findProduct(p.catalogId, p.nr);
      net = net ?? cp?.pretFaraTVA ?? null;
      tva = tva ?? cp?.pretCuTVA ?? null;
    }
    if (net != null && tva == null) tva = Math.round(net * 1.19 * 100) / 100;
    if (tva != null && net == null) net = Math.round(tva / 1.19 * 100) / 100;
    return { net: net ?? 0, tva: tva ?? 0 };
  }

  productMasa(p: OrderProduct): number {
    return p.masaNeta ?? this.catalogsService.findProduct(p.catalogId ?? '', p.nr)?.masaNeta ?? 0;
  }

  tripValue(t: Transport): { net: number; tva: number } {
    let net = 0, tva = 0;
    for (const del of t.deliveries) {
      const order = this.ordersService.orders().find(o => o.id === del.orderId);
      if (!order) continue;
      for (const item of del.items) {
        const p = order.products[item.productIndex];
        if (p) {
          const price = this.productPrice(p);
          net += price.net * item.qty;
          tva += price.tva * item.qty;
        }
      }
    }
    return { net, tva };
  }

  tripWeight(t: Transport): number {
    let total = 0;
    for (const del of t.deliveries) {
      const order = this.ordersService.orders().find(o => o.id === del.orderId);
      if (!order) continue;
      for (const item of del.items) {
        const p = order.products[item.productIndex];
        if (p) total += this.productMasa(p) * item.qty;
      }
    }
    return total;
  }

  tripWeightWarn(t: Transport): boolean {
    const v = this.transportService.getVehicle(t.vehicleId);
    if (!v?.tonajMaxim) return false;
    return this.tripWeight(t) > v.tonajMaxim;
  }

  fmtWeight(kg: number): string {
    if (kg <= 0) return '';
    return kg >= 1000
      ? `${(kg / 1000).toFixed(2).replace(/\.?0+$/, '')} t`
      : `${kg.toFixed(1).replace(/\.0$/, '')} kg`;
  }

  toggleExpand(id: string): void { this.expandedId.update(v => v === id ? null : id); }

  stepIndex(t: Transport): number { return STATUS_STEPS.indexOf(t.status as TransportStatus); }

  setTripStatus(t: Transport, status: TransportStatus): void {
    if (status === t.status) return;
    if (status === 'livrat' && !confirm('Marchezi cursa ca finalizată?')) return;
    this.transportService.setStatus(t.id, status);
    if (status === 'livrat') {
      for (const { orderId } of t.deliveries) {
        const order = this.ordersService.orders().find(o => o.id === orderId);
        if (order) this.ordersService.updateDeliveryState(orderId, this._getDeliveredQtyArr(order));
      }
    }
    const msgs: Partial<Record<TransportStatus, string>> = {
      planificat: 'Cursă repusă pe Planificat.', confirmat_sofer: 'Cursa confirmată!',
      in_livrare: 'Cursa a pornit!', livrat: 'Livrare finalizată!'
    };
    this.snackBar.open(msgs[status] ?? 'Status actualizat.', '', { duration: 2200, panelClass: ['snack-success'] });
  }

  openTripFromCalendar(t: Transport): void {
    if (this.isOverdue(t)) {
      this.showOverdueTrips.set(true);
    } else {
      this.showActive.set(true);
    }
    this.expandedId.set(t.id);
    setTimeout(() => {
      document.getElementById('trip-' + t.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
  }

  togglePendingExpand(orderId: string): void {
    this.expandedPendingId.update(v => v === orderId ? null : orderId);
  }

  toggleHistoryExpand(orderId: string): void {
    this.expandedHistoryIds.update(set => {
      const copy = new Set(set);
      copy.has(orderId) ? copy.delete(orderId) : copy.add(orderId);
      return copy;
    });
  }

  openCreateForVehicleDay(vehicleId: string, isoDate: string): void {
    this.editingId.set(null);
    this.formLockedToOrder.set(false);
    this.formVehicleId.set(vehicleId);
    this.formDriverId.set('');
    this.formHelperName.set('');
    this.formPlecareDate.set(isoDate);
    this.formPlecareTime.set('08:00');
    this.formSosireDate.set(isoDate);
    this.formSosireTime.set('18:00');
    this.formModalOrders.set([]); this.formModalQty.set({}); this.formDeliveryNotes.set({}); this.formOrderObs.set({});
    this.editingAddrId.set(null); this.editingDeadlineId.set(null);
    this.showForm.set(true);
  }

  tripsForVehicleDay(vehicleId: string, isoDate: string): Transport[] {
    return this.transportService.transports()
      .filter(t => {
        if (t.vehicleId !== vehicleId) return false;
        if (['livrat','anulat','sters'].includes(t.status)) return false;
        const p = t.oraPlecare.slice(0, 10);
        const s = t.oraSosire.slice(0, 10);
        return p <= isoDate && isoDate <= s;
      })
      .sort((a, b) => a.oraPlecare.localeCompare(b.oraPlecare));
  }

  tripsForOrderHistory(orderId: string): Transport[] {
    return this.transportService.transports()
      .filter(t => t.status !== 'sters' && t.deliveries.some(d => d.orderId === orderId))
      .sort((a, b) => a.oraPlecare.localeCompare(b.oraPlecare));
  }

  orderTripStatus(o: Order): { label: string; cls: string } {
    const t = this.transportService.transports()
      .filter(tr => tr.status !== 'livrat' && tr.status !== 'anulat' && tr.status !== 'sters')
      .find(tr => tr.deliveries.some(d => d.orderId === o.id));
    if (!t) return { label: 'Neplanificat', cls: 'mto-badge--unplanned' };
    if (t.status === 'in_livrare') return { label: 'În livrare', cls: 'mto-badge--active' };
    const fullyPlanned = this.getRemainingQtyArr(o).every(q => q === 0);
    return fullyPlanned
      ? { label: 'Planificat',         cls: 'mto-badge--plan'    }
      : { label: 'Parțial planificat', cls: 'mto-badge--partial' };
  }

  orderTotalValue(o: Order): { net: number; tva: number } {
    return o.products.reduce((s, p) => {
      const price = this.productPrice(p);
      return { net: s.net + p.qty * price.net, tva: s.tva + p.qty * price.tva };
    }, { net: 0, tva: 0 });
  }

  orderTotalWeight(o: Order): number {
    return o.products.reduce((s, p) => s + this.productMasa(p) * p.qty, 0);
  }

  fmtTime(iso: string): string {
    return iso.slice(11, 16);
  }

  calChipLabel(t: Transport): string {
    if (!t.deliveries?.length) return this.fmtTime(t.oraPlecare);
    const ids = [...new Set(t.deliveries.map(d => d.orderId))];
    const nums = ids
      .map(id => this.ordersService.orders().find(o => o.id === id))
      .filter((o): o is Order => !!o)
      .map(o => `#${o.orderNumber}`);
    return nums.length ? nums.join(' · ') : this.fmtTime(t.oraPlecare);
  }

  addProductsToOrder(orderId: string): void {
    this.router.navigate(['/app/m-new-order'], {
      state: { addToOrderId: orderId, addPending: true }
    });
  }

  readonly deletedOrders = computed(() =>
    this.ordersService.orders()
      .filter(o => o.status === 'sters')
      .sort((a, b) => (b.deletedAt ?? b.timestamp).localeCompare(a.deletedAt ?? a.timestamp))
  );

  deleteOrder(o: Order): void {
    if (!confirm(`Ștergi comanda #${o.orderNumber} - ${o.client.name}?`)) return;
    this.ordersService.hardDeleteOrder(o.id);
    this.snackBar.open(`Comanda #${o.orderNumber} a fost ștearsă.`, '', { duration: 2500 });
  }

  restoreDeletedOrder(o: Order): void {
    this.ordersService.restoreOrder(o.id);
    this.snackBar.open(`Comanda #${o.orderNumber} restaurată (status: Anulat).`, '', { duration: 3000 });
  }

  // ── Public qty helpers ────────────────────────────────────────────────────

  getRemainingQtyArr(order: Order, excludeId?: string | null): number[] {
    return order.products.map((_, i) => this._getRemainingQty(order, i, excludeId));
  }

  getFormMaxQty(order: Order, idx: number): number {
    return this._getRemainingQty(order, idx, this.editingId());
  }

  // ── Form modal methods ────────────────────────────────────────────────────

  addOrderToForm(order: Order): void {
    if (this.formModalOrders().some(o => o.id === order.id)) return;
    const rem = this.getRemainingQtyArr(order, this.editingId());
    const qtyMap: Record<number, number> = {};
    rem.forEach((q, i) => { if (q > 0) qtyMap[i] = q; });
    this.formModalOrders.update(arr => [...arr, order]);
    this.formModalQty.update(m => ({ ...m, [order.id]: qtyMap }));
    // pre-populate obs buffer: observatii proprii sau nota clientului (fallback ca în card)
    this.formOrderObs.update(m => ({ ...m, [order.id]: order.observatii ?? order.client.note ?? '' }));
  }

  removeOrderFromForm(orderId: string): void {
    this.formModalOrders.update(arr => arr.filter(o => o.id !== orderId));
    this.formModalQty.update(m => { const c = { ...m }; delete c[orderId]; return c; });
    this.formDeliveryNotes.update(m => { const c = { ...m }; delete c[orderId]; return c; });
    this.formOrderObs.update(m => { const c = { ...m }; delete c[orderId]; return c; });
    if (this.editingAddrId() === orderId) this.editingAddrId.set(null);
    if (this.editingDeadlineId() === orderId) this.editingDeadlineId.set(null);
  }

  getFormQty(orderId: string, idx: number): number {
    return this.formModalQty()[orderId]?.[idx] ?? 0;
  }

  setFormQty(orderId: string, idx: number, val: number): void {
    const order = this.formModalOrders().find(o => o.id === orderId);
    if (!order) return;
    const max = this._getRemainingQty(order, idx, this.editingId());
    this.formModalQty.update(m => ({
      ...m,
      [orderId]: { ...(m[orderId] ?? {}), [idx]: Math.max(0, Math.min(val, max)) }
    }));
  }

  getFormNote(orderId: string): string { return this.formDeliveryNotes()[orderId] ?? ''; }

  setFormNote(orderId: string, val: string): void {
    this.formDeliveryNotes.update(m => ({ ...m, [orderId]: val }));
  }

  getProductMasa(p: OrderProduct): number {
    return p.masaNeta ?? this.catalogsService.findProduct(p.catalogId ?? '', p.nr)?.masaNeta ?? 0;
  }

  getProductPret(p: OrderProduct): number {
    return p.pretCuTVA ?? this.catalogsService.findProduct(p.catalogId ?? '', p.nr)?.pretCuTVA ?? 0;
  }

  getFormObs(orderId: string): string {
    return this.formOrderObs()[orderId] ?? '';
  }

  setFormObs(orderId: string, val: string): void {
    this.formOrderObs.update(m => ({ ...m, [orderId]: val }));
    this.ordersService.updateOrderObservatii(orderId, val);
  }

  formMoveOrderUp(orderId: string): void {
    this.formModalOrders.update(arr => {
      const idx = arr.findIndex(o => o.id === orderId);
      if (idx <= 0) return arr;
      const n = [...arr];
      [n[idx - 1], n[idx]] = [n[idx], n[idx - 1]];
      return n;
    });
  }

  formMoveOrderDown(orderId: string): void {
    this.formModalOrders.update(arr => {
      const idx = arr.findIndex(o => o.id === orderId);
      if (idx < 0 || idx >= arr.length - 1) return arr;
      const n = [...arr];
      [n[idx], n[idx + 1]] = [n[idx + 1], n[idx]];
      return n;
    });
  }

  startEditAddr(order: Order): void {
    this.editingAddrId.set(order.id);
    this.addrEdit.set(order.client.address ?? '');
  }

  saveAddr(order: Order): void {
    this.ordersService.updateOrderClient(order.id, { address: this.addrEdit().trim() });
    this.editingAddrId.set(null);
  }

  cancelEditAddr(): void { this.editingAddrId.set(null); }

  startEditDeadline(order: Order): void {
    this.editingDeadlineId.set(order.id);
    this.deadlineDateEdit.set(order.deliveryDate ?? '');
    this.deadlineTimeEdit.set(order.deliveryTime ?? '');
  }

  saveDeadline(order: Order): void {
    this.ordersService.updateOrderDeliveryDateTime(order.id, this.deadlineDateEdit(), this.deadlineTimeEdit());
    this.editingDeadlineId.set(null);
  }

  cancelEditDeadline(): void { this.editingDeadlineId.set(null); }

  formOrderDeadlineStatus(order: Order): 'ok' | 'warn' | 'no-deadline' {
    if (!order.deliveryDate) return 'no-deadline';
    const pd = this.formPlecareDate(), pt = this.formPlecareTime();
    const sd = this.formSosireDate(), st = this.formSosireTime();
    if (!pd || !sd) return 'ok';
    const from = new Date(`${pd}T${pt}:00`).getTime();
    const to   = new Date(`${sd}T${st}:00`).getTime();
    const deadlineStr = order.deliveryDate + 'T' + (order.deliveryTime ?? '23:59') + ':00';
    const dl = new Date(deadlineStr).getTime();
    return (dl >= from && dl <= to) ? 'ok' : 'warn';
  }

  hasPendingChanges(o: Order): boolean {
    return !!(o.pendingProducts?.length || o.adminProducts?.length);
  }

  finalizeWithChanges(o: Order): void {
    const pending = [...(o.pendingProducts ?? []), ...(o.adminProducts ?? [])];
    const newProducts = [...o.products, ...pending].filter(p => p.qty > 0);
    if (!newProducts.length) return;
    const allAdded = [...(o.addedProducts ?? []), ...pending];
    const newOrder: Order = {
      id: generateId(), timestamp: new Date().toISOString(),
      agent: o.agent, client: o.client,
      cuLivrare: o.cuLivrare, deliveryDate: o.deliveryDate, deliveryTime: o.deliveryTime,
      helper: o.helper, observatii: o.observatii,
      products: newProducts, status: 'acceptat', revisedFromId: o.id,
      addedProducts: allAdded.length > 0 ? allAdded : undefined
    };
    const result = this.ordersService.reviseOrder(o.id, newOrder);
    if (!result.ok) {
      const list = result.insufficient.map(i => `• ${i.name}: disponibil ${i.available}, solicitat ${i.requested}`).join('\n');
      this.snackBar.open(`Stoc insuficient:\n${list}`, 'Închide', { duration: 5000, panelClass: ['snack-error'] });
      return;
    }
    this.expandedPendingId.set(null);
    this.snackBar.open('Comanda finalizată cu modificări!', 'OK', { duration: 3000, panelClass: ['snack-success'] });
  }

  mapsLink(address: string): string {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  }

  // ── Istoric planificări comenzi — delivery detail ─────────────────────────
  selectedDelivery = signal<{ order: Order; items: { name: string; qty: number; um: string }[] } | null>(null);

  openDelivery(t: Transport, o: Order): void {
    this.selectedDelivery.set({ order: o, items: this.deliveryItemsForOrder(t, o.id) });
  }

  closeDelivery(): void { this.selectedDelivery.set(null); }

  openBestTripForOrder(o: Order): void {
    const trips = this.tripsForOrderHistory(o.id);
    if (!trips.length) return;
    const t = trips.find(tr => tr.status !== 'livrat') ?? trips[trips.length - 1];
    this.openDelivery(t, o);
  }

  orderPendingValue(order: Order): { net: number; tva: number } {
    const delivered = this._getDeliveredQtyArr(order);
    return order.products.reduce((s, p, i) => {
      const rem = Math.max(0, p.qty - (delivered[i] || 0));
      const price = this.productPrice(p);
      return { net: s.net + price.net * rem, tva: s.tva + price.tva * rem };
    }, { net: 0, tva: 0 });
  }

  tripOrderWeight(t: Transport, o: Order): number {
    const d = t.deliveries.find(d => d.orderId === o.id);
    if (!d?.items.length) return 0;
    return d.items.reduce((s, item) => {
      const p = o.products[item.productIndex];
      return s + this.getProductMasa(p) * item.qty;
    }, 0);
  }

  tripOrderValue(t: Transport, o: Order): { net: number; tva: number } {
    const d = t.deliveries.find(d => d.orderId === o.id);
    if (!d?.items.length) return { net: 0, tva: 0 };
    return d.items.reduce((s, item) => {
      const p = o.products[item.productIndex];
      if (!p) return s;
      const price = this.productPrice(p);
      return { net: s.net + price.net * item.qty, tva: s.tva + price.tva * item.qty };
    }, { net: 0, tva: 0 });
  }

  private _orderObsBuffer = new Map<string, string>();
  setOrderObsBuffer(orderId: string, val: string): void { this._orderObsBuffer.set(orderId, val); }
  saveOrderObsBuffer(orderId: string): void {
    if (!this._orderObsBuffer.has(orderId)) return;
    this.ordersService.updateOrderObservatii(orderId, this._orderObsBuffer.get(orderId)!);
    this._orderObsBuffer.delete(orderId);
  }

  // ── Editare comandă (mobile inline) ───────────────────────────────────────
  editingMobileOrderId = signal<string | null>(null);
  private _mobileEditQty = signal<Record<string, number>>({});

  openMobileEdit(o: Order): void {
    const map: Record<string, number> = {};
    o.products.forEach((p, i) => { map[`${o.id}:${i}`] = p.qty; });
    this._mobileEditQty.set(map);
    this.editingMobileOrderId.set(o.id);
  }

  getMobileEditQty(orderId: string, idx: number, def: number): number {
    return this._mobileEditQty()[`${orderId}:${idx}`] ?? def;
  }

  setMobileEditQty(orderId: string, idx: number, qty: number): void {
    this._mobileEditQty.update(m => ({ ...m, [`${orderId}:${idx}`]: Math.max(0, qty) }));
  }

  cancelMobileEdit(): void {
    this.editingMobileOrderId.set(null);
  }

  confirmMobileEdit(o: Order): void {
    const newProducts = o.products
      .map((p, i) => ({ ...p, qty: this.getMobileEditQty(o.id, i, p.qty) }))
      .filter(p => p.qty > 0);
    if (!newProducts.length) {
      this.snackBar.open('Cel puțin un produs trebuie să rămână.', '', { duration: 2500 });
      return;
    }
    const session = this.auth.session();
    const event: Omit<import('../../core/models/order.model').OrderEvent, 'id'> = {
      timestamp: new Date().toISOString(),
      userId: session?.userId ?? 0,
      userName: session?.name ?? '—',
      source: 'transport',
      type: 'products_updated',
      products: newProducts.map(p => ({ name: p.name, qty: p.qty, um: p.um })),
    };
    const result = this.ordersService.updateOrderProducts(o.id, newProducts, event);
    if (!result.ok) {
      const list = result.insufficient.map(i => `• ${i.name}: disponibil ${i.available}, solicitat ${i.requested}`).join('\n');
      this.snackBar.open(`Stoc insuficient:\n${list}`, 'Închide', { duration: 5000, panelClass: ['snack-error'] });
      return;
    }
    this.editingMobileOrderId.set(null);
    this.expandedPendingId.set(null);
    this.snackBar.open('Comanda modificată!', 'OK', { duration: 3000, panelClass: ['snack-success'] });
  }

  mobileEditMaxQty(p: OrderProduct): number | null {
    if (!p.catalogId) return null;
    const available = this.catalogsService.getStock(p.catalogId, p.nr);
    if (available == null) return null;
    return available + p.qty;
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────

  openCreate(preselect?: string): void {
    this.editingId.set(null);
    this.formVehicleId.set('');
    this.formDriverId.set('');
    this.formHelperName.set('');
    const today = new Date().toISOString().slice(0, 10);
    this.formPlecareDate.set(today); this.formPlecareTime.set('08:00');
    this.formSosireDate.set(today);  this.formSosireTime.set('18:00');
    this.formModalOrders.set([]); this.formModalQty.set({}); this.formDeliveryNotes.set({}); this.formOrderObs.set({});
    this.editingAddrId.set(null); this.editingDeadlineId.set(null);
    if (preselect) {
      const o = this.ordersService.orders().find(x => x.id === preselect);
      if (o) this.addOrderToForm(o);
      this.formLockedToOrder.set(true);
    } else {
      this.formLockedToOrder.set(false);
    }
    this.showForm.set(true);
  }

  openEdit(t: Transport): void {
    this.editingId.set(t.id);
    this.formLockedToOrder.set(false);
    this.formVehicleId.set(t.vehicleId);
    this.formDriverId.set(t.driverId);
    this.formHelperName.set(t.helper ?? '');
    this.formPlecareDate.set(t.oraPlecare.slice(0, 10));
    this.formPlecareTime.set(t.oraPlecare.slice(11, 16));
    this.formSosireDate.set(t.oraSosire.slice(0, 10));
    this.formSosireTime.set(t.oraSosire.slice(11, 16));
    this.editingAddrId.set(null); this.editingDeadlineId.set(null);
    const modalOrders: Order[] = [];
    const modalQty: Record<string, Record<number, number>> = {};
    const notes: Record<string, string> = {};
    const obsMap: Record<string, string> = {};
    for (const del of t.deliveries) {
      const order = this.ordersService.orders().find(o => o.id === del.orderId);
      if (!order) continue;
      modalOrders.push(order);
      const qm: Record<number, number> = {};
      for (const item of del.items) qm[item.productIndex] = item.qty;
      modalQty[order.id] = qm;
      if (del.observatii) notes[order.id] = del.observatii;
      obsMap[order.id] = order.observatii ?? order.client.note ?? '';
    }
    this.formModalOrders.set(modalOrders);
    this.formModalQty.set(modalQty);
    this.formDeliveryNotes.set(notes);
    this.formOrderObs.set(obsMap);
    this.showForm.set(true);
  }

  closeForm(): void { this.showForm.set(false); }

  save(): void {
    const vId = this.formVehicleId(), dId = this.formDriverId();
    if (!vId || !dId) {
      this.snackBar.open('Selectați mașina și șoferul.', '', { duration: 2500 }); return;
    }
    if (!this.formPlecareDate() || !this.formSosireDate()) {
      this.snackBar.open('Completați datele de plecare și sosire.', '', { duration: 2500 }); return;
    }
    if (this.formModalOrders().length === 0) {
      this.snackBar.open('Adaugă cel puțin o comandă la cursă.', '', { duration: 2500 }); return;
    }

    const oraPlecare = `${this.formPlecareDate()}T${this.formPlecareTime()}:00`;
    const oraSosire  = `${this.formSosireDate()}T${this.formSosireTime()}:00`;

    if (new Date(oraPlecare) < new Date()) {
      this.snackBar.open('Ora de plecare nu poate fi în trecut.', '', { duration: 3500 }); return;
    }
    if (oraSosire <= oraPlecare) {
      this.snackBar.open('Data/ora de sosire trebuie să fie după plecare.', '', { duration: 3000 }); return;
    }

    const editId  = this.editingId();
    const qtyMap  = this.formModalQty();
    const notesMap = this.formDeliveryNotes();
    const deliveries: TripDelivery[] = [];

    for (const order of this.formModalOrders()) {
      const oq = qtyMap[order.id] ?? {};
      const items: TripOrderItem[] = Object.entries(oq)
        .filter(([, q]) => q > 0)
        .map(([idx, q]) => ({ productIndex: Number(idx), qty: q }));
      if (!items.length) continue;
      const del: TripDelivery = { orderId: order.id, items };
      const note = notesMap[order.id];
      if (note?.trim()) del.observatii = note.trim();
      deliveries.push(del);
    }

    if (deliveries.length === 0) {
      this.snackBar.open('Setează cel puțin o cantitate > 0 pentru un produs.', '', { duration: 2500 }); return;
    }

    const overlap = this._checkOverlap(oraPlecare, oraSosire, vId, dId, editId);
    if (overlap.vehicle || overlap.driver) {
      const who = overlap.vehicle && overlap.driver ? 'Mașina și șoferul'
        : overlap.vehicle ? 'Mașina' : 'Șoferul';
      const conflictTrip = this.transportService.transports()
        .filter(t => !['livrat','anulat','sters'].includes(t.status) && t.id !== editId)
        .find(t => {
          const pA = new Date(oraPlecare).getTime(), sA = new Date(oraSosire).getTime();
          const pB = new Date(t.oraPlecare).getTime(), sB = new Date(t.oraSosire).getTime();
          return pA < this._effectiveEndMs(pB, sB) && pB < this._effectiveEndMs(pA, sA) &&
            (overlap.vehicle ? t.vehicleId === vId : t.driverId === dId);
        });
      let msg = `${who} nu este disponibil în această perioadă.`;
      if (conflictTrip) {
        const clients = this.ordersForTransport(conflictTrip).map(o => o.client.name).join(', ');
        msg += ` Cursă existentă: ${this.fmtDT(conflictTrip.oraPlecare)} → ${this.fmtDT(conflictTrip.oraSosire)} (${clients})`;
      }
      this.snackBar.open(msg, 'OK', { duration: 8000 }); return;
    }

    const helperName = this.formHelperName().trim() || undefined;
    if (helperName) {
      const pA = new Date(oraPlecare).getTime(), sA = new Date(oraSosire).getTime();
      const eA = this._effectiveEndMs(pA, sA);
      const helperBusy = this.transportService.transports()
        .filter(t => !['livrat','anulat','sters'].includes(t.status) && t.id !== editId && t.helper === helperName)
        .some(t => {
          const pB = new Date(t.oraPlecare).getTime(), sB = new Date(t.oraSosire).getTime();
          return pA < this._effectiveEndMs(pB, sB) && pB < eA;
        });
      if (helperBusy) {
        this.snackBar.open(`${helperName} este deja în cursă. Alege altă persoană.`, 'OK', { duration: 5000 }); return;
      }
    }

    if (editId) {
      this.transportService.updateTransport(editId, { vehicleId: vId, driverId: dId, helper: helperName, deliveries, oraPlecare, oraSosire });
      this.snackBar.open('Cursa actualizată.', '', { duration: 2000 });
    } else {
      this.transportService.createTransport({ vehicleId: vId, driverId: dId, helper: helperName, deliveries, oraPlecare, oraSosire });
      for (const order of this.formModalOrders()) {
        if (order.status === 'acceptat') this.ordersService.updateOrderStatus(order.id, 'planificat');
      }
      this.snackBar.open('Cursă planificată.', '', { duration: 2000 });
    }
    this.closeForm();
  }

  deleteTransport(t: Transport): void {
    if (!confirm('Muți această cursă în Curse șterse? Comenzile vor reveni la statusul anterior.')) return;
    this.transportService.setStatus(t.id, 'sters');
    const affected = [...new Set(t.deliveries.map(d => d.orderId))];
    for (const orderId of affected) {
      const order = this.ordersService.orders().find(o => o.id === orderId);
      if (!order) continue;
      const delivered = this._getDeliveredQtyArr(order);
      if (delivered.some(q => q > 0)) {
        this.ordersService.updateDeliveryState(orderId, delivered);
      } else {
        this.ordersService.updateOrderStatus(orderId, 'acceptat');
      }
    }
    this.expandedId.set(null);
    this.snackBar.open('Cursa a fost mutată în Curse șterse.', '', { duration: 2200 });
  }

  restoreTransport(t: Transport): void {
    this.transportService.setStatus(t.id, 'planificat');
    this.snackBar.open('Cursa a fost redeschisă.', '', { duration: 2000 });
  }

  // ── WhatsApp ──────────────────────────────────────────────────────────────

  sendDriverWhatsApp(t: Transport): void {
    const driver = this.transportService.getDriver(t.driverId);
    if (!driver?.telefon) { this.snackBar.open('Șoferul nu are număr de telefon configurat.', 'OK', { duration: 3000 }); return; }
    const phone = driver.telefon.replace(/\D/g, '');
    window.open(`https://wa.me/${phone.startsWith('0') ? '4' + phone : phone}?text=${encodeURIComponent(this._buildTripMsg(t))}`, '_blank');
    this.transportService.markWaSent(t.id, 'driver');
  }

  sendGroupWhatsApp(t: Transport, contact: WhatsAppContact): void {
    window.open(`https://wa.me/${contact.phone.replace(/\D/g, '')}?text=${encodeURIComponent(this._buildTripMsg(t))}`, '_blank');
  }

  helperHasPhone(t: Transport): boolean {
    if (!t.helper) return false;
    return [...this.transportService.helpers(), ...this.transportService.drivers()]
      .some(d => d.nume === t.helper && !!d.telefon);
  }

  sendHelperWhatsApp(t: Transport): void {
    if (!t.helper) return;
    const person = [...this.transportService.helpers(), ...this.transportService.drivers()]
      .find(d => d.nume === t.helper);
    if (!person?.telefon) { this.snackBar.open(`${t.helper} nu are număr de telefon configurat.`, 'OK', { duration: 3000 }); return; }
    const phone = person.telefon.replace(/\D/g, '');
    window.open(`https://wa.me/${phone.startsWith('0') ? '4' + phone : phone}?text=${encodeURIComponent(this._buildTripMsg(t))}`, '_blank');
    this.transportService.markWaSent(t.id, 'helper');
  }

  notifyDriverDeleted(t: Transport): void {
    const driver = this.transportService.getDriver(t.driverId);
    if (!driver?.telefon) { this.snackBar.open('Șoferul nu are număr de telefon configurat.', 'OK', { duration: 3000 }); return; }
    const msg   = `Cursa ta din ${this.fmtDT(t.oraPlecare)} a fost ANULATĂ.`;
    const phone = driver.telefon.replace(/\D/g, '');
    window.open(`https://wa.me/${phone.startsWith('0') ? '4' + phone : phone}?text=${encodeURIComponent(msg)}`, '_blank');
  }

  // ── Delivery details ─────────────────────────────────────────────────────

  deliveryItemsForOrder(t: Transport, orderId: string): { name: string; qty: number; um: string }[] {
    const delivery = t.deliveries.find(d => d.orderId === orderId);
    const order = this.ordersService.orders().find(o => o.id === orderId);
    if (!delivery || !order) return [];
    return delivery.items
      .filter(item => item.qty > 0)
      .map(item => {
        const p = order.products[item.productIndex];
        return { name: p?.name ?? '?', qty: item.qty, um: p?.um ?? '' };
      });
  }

  getDeliveryNote(t: Transport, orderId: string): string {
    const order = this.ordersService.orders().find(o => o.id === orderId);
    return order?.observatii ?? order?.client.note ?? '';
  }

  setObsBuffer(tripId: string, orderId: string, val: string): void {
    this._obsBuffer.set(`${tripId}::${orderId}`, val);
  }

  saveObsBuffer(t: Transport, orderId: string): void {
    const key = `${t.id}::${orderId}`;
    if (!this._obsBuffer.has(key)) return;
    const note = this._obsBuffer.get(key)!;
    this.ordersService.updateOrderObservatii(orderId, note.trim());
    this._obsBuffer.delete(key);
  }

  private _buildTripMsg(t: Transport): string {
    const orders = this.ordersForTransport(t);
    const lines = orders.map(o => `• ${o.client.name}${o.client.address ? ' — ' + o.client.address : ''}`).join('\n');
    return `Cursa:\nPlecare: ${this.transportService.formatDateTime(t.oraPlecare)}\nSosire: ${this.transportService.formatDateTime(t.oraSosire)}\n${lines}`;
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private _obsBuffer = new Map<string, string>();

  private _effectiveEndMs(plecare: number, sosire: number): number {
    const duration = sosire - plecare;
    return sosire + Math.min(duration * 0.5, 2 * 3_600_000);
  }

  private _checkOverlap(plecare: string, sosire: string, vehicleId: string, driverId: string, excludeId?: string | null): { vehicle: boolean; driver: boolean } {
    const pA = new Date(plecare).getTime(), sA = new Date(sosire).getTime();
    const eA = this._effectiveEndMs(pA, sA);
    let vehicle = false, driver = false;
    for (const t of this.transportService.transports()) {
      if (t.status === 'livrat' || t.status === 'anulat' || t.status === 'sters' || t.id === excludeId) continue;
      const pB = new Date(t.oraPlecare).getTime(), sB = new Date(t.oraSosire).getTime();
      if (pA < this._effectiveEndMs(pB, sB) && pB < eA) {
        if (t.vehicleId === vehicleId) vehicle = true;
        if (t.driverId  === driverId)  driver  = true;
      }
    }
    return { vehicle, driver };
  }

  private _getDeliveredQtyArr(order: Order): number[] {
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

  private _hasRemainingItems(order: Order, excludeId?: string | null): boolean {
    return order.products.some((_, i) => this._getRemainingQty(order, i, excludeId) > 0);
  }

  private _getRemainingQty(order: Order, productIndex: number, excludeId?: string | null): number {
    const p = order.products[productIndex];
    if (!p) return 0;
    let delivered = 0, onTrip = 0;
    for (const t of this.transportService.transports()) {
      if (t.status === 'sters' || t.status === 'anulat') continue;
      const del = t.deliveries.find(d => d.orderId === order.id);
      if (!del) continue;
      const item = del.items.find(i => i.productIndex === productIndex);
      if (!item) continue;
      if (t.status === 'livrat') delivered += item.qty;
      else if (t.id !== excludeId) onTrip += item.qty;
    }
    return Math.max(0, p.qty - delivered - onTrip);
  }
}
