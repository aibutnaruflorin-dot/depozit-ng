import { Component, signal, computed, OnInit, WritableSignal, Signal, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { startWith } from 'rxjs/operators';
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
import { OrdersService, generateId } from '../../core/services/orders.service';
import { AuthService } from '../../core/services/auth.service';
import { CatalogsService } from '../../core/services/catalogs.service';
import { StorageService } from '../../core/services/storage.service';
import { Transport, TransportStatus, TripDelivery } from '../../core/models/transport.model';
import { Order } from '../../core/models/order.model';
import { WhatsAppContact } from '../../core/models/whatsapp.model';
import { DragModalDirective } from '../../shared/drag-modal.directive';
import { InitValueDirective } from '../../shared/init-textarea.directive';
import { AddProductsModalComponent } from '../../shared/add-products-modal/add-products-modal.component';
import { MatMenuModule } from '@angular/material/menu';
import { PaginatorModule } from 'primeng/paginator';

// ── Validators ────────────────────────────────────────────────────────────────

function plecareNotInPast(g: AbstractControl): ValidationErrors | null {
  const pd = g.get('plecareDate')?.value as string;
  const pt = g.get('plecareTime')?.value as string;
  if (!pd || !pt) return null;
  const dt = new Date(pd + 'T' + pt);
  return dt < new Date() ? { plecareInPast: true } : null;
}

function sosireAfterPlecare(g: AbstractControl): ValidationErrors | null {
  const pd = g.get('plecareDate')?.value as string;
  const pt = g.get('plecareTime')?.value as string;
  const sd = g.get('sosireDate')?.value as string;
  const st = g.get('sosireTime')?.value as string;
  if (!pd || !pt || !sd || !st) return null;
  const plecare = combineDateTime(pd, pt);
  const sosire  = combineDateTime(sd, st);
  return sosire && plecare && sosire <= plecare ? { sosireBeforePlecare: true } : null;
}

function combineDateTime(date: Date | string | null, time: string): string {
  if (!date || !time) return '';
  const d = typeof date === 'string' ? new Date(date + 'T00:00:00') : new Date(date);
  const [h, m] = time.split(':').map(Number);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
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
  overdue?: boolean;
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
    MatChipsModule, MatSnackBarModule, MatMenuModule,
    MatDatepickerModule, MatAutocompleteModule, PaginatorModule,
    DragModalDirective, InitValueDirective, AddProductsModalComponent
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
  readonly todayStr = new Date().toISOString().slice(0, 10);

  showHistoric      = signal(false);
  showCalendar      = signal(false);
  showOrders        = signal(true);
  showActive        = signal(true);
  showOverdueOrders = signal(true);
  showOverdueTrips  = signal(true);

  selectedDelivery = signal<{
    order: Order;
    items: { name: string; qty: number; um: string }[];
  } | null>(null);

  openDelivery(t: Transport, o: Order): void {
    this.selectedDelivery.set({ order: o, items: this.deliveryItems(t, o.id) });
  }

  closeDelivery(): void {
    this.selectedDelivery.set(null);
  }

  deliveryItems(t: Transport, orderId: string): { name: string; qty: number; um: string }[] {
    const delivery = t.deliveries.find(d => d.orderId === orderId);
    const order    = this.getOrder(orderId);
    if (!delivery || !order) return [];
    return delivery.items
      .filter(item => item.qty > 0)
      .map(item => {
        const p = order.products[item.productIndex];
        return { name: p?.name ?? '?', qty: item.qty, um: p?.um ?? '' };
      });
  }

  fmtTs(iso: string | undefined): string {
    if (!iso) return '—';
    return this.transportService.formatDateTime(iso);
  }

  fmtDuration(from: string | undefined, to: string | undefined): string {
    if (!from || !to) return '—';
    const ms = new Date(to).getTime() - new Date(from).getTime();
    if (ms <= 0) return '—';
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  showModal = signal(false);
  editingId = signal<string | null>(null);

  // ── Modal state (article-level selection) ─────────────────────────────────
  modalOrders    = signal<Order[]>([]);
  modalQty       = signal<Record<string, Record<number, number>>>({});
  deliveryNotes  = signal<Record<string, string>>({});
  orderSearch    = signal('');
  singleOrderMode = signal(false);

  // ── Add products modal ────────────────────────────────────────────────────
  addProductsOrderId = signal<string | null>(null);
  readonly addProductsOrder = computed(() => {
    const id = this.addProductsOrderId();
    return id ? this.ordersService.orders().find(o => o.id === id) ?? null : null;
  });

  readonly modalTotalWeight = computed(() => {
    return this.modalOrders().reduce((sum, order) => {
      const qtyMap = this.modalQty()[order.id] ?? {};
      return sum + order.products.reduce((si, p, i) => {
        const qty = qtyMap[i] ?? 0;
        const masa = p.masaNeta
          ?? this.catalogsService.findProduct(p.catalogId ?? '', p.nr)?.masaNeta
          ?? 0;
        return si + masa * qty;
      }, 0);
    }, 0);
  });

  private _formVehicleIdSig!: ReturnType<typeof toSignal<string>>;
  modalVehicleMaxKg!: Signal<number>;

  // ── Inline edit state for order meta fields ────────────────────────────────
  editingAddressId  = signal<string | null>(null);
  addressEdit       = signal('');
  editingDeadlineId = signal<string | null>(null);
  deadlineDateEdit  = signal('');
  deadlineTimeEdit  = signal('');

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
    return this.ordersService.orders()
      .filter(o => {
        if (!o.cuLivrare || o.superseded) return false;
        if (!['acceptat', 'livrat_partial', 'planificat'].includes(o.status)) return false;
        return this._hasRemainingItemsExcluding(o);
      })
      .sort((a, b) => (a.deliveryDate ?? a.timestamp).localeCompare(b.deliveryDate ?? b.timestamp));
  });

  deliveryOrdersOnTime = computed<Order[]>(() =>
    this.deliveryOrders().filter(o => !this.isOrderDeadlineOverdue(o))
  );

  deliveryOrdersOverdue = computed<Order[]>(() =>
    this.deliveryOrders().filter(o => this.isOrderDeadlineOverdue(o))
  );

  eligibleOrders = computed<Order[]>(() => {
    const editId = this.editingId() ?? undefined;
    return this.ordersService.orders().filter(o => {
      if (!o.cuLivrare || o.superseded) return false;
      if (!['acceptat', 'livrat_partial', 'planificat'].includes(o.status)) return false;
      return this._hasRemainingItemsExcluding(o, editId);
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

  readonly activeOnTime = computed(() =>
    this.transportService.transports()
      .filter(t => {
        if (t.status === 'livrat' || t.status === 'sters') return false;
        if (new Date(t.oraSosire).getTime() < Date.now()) return false;
        return !this.ordersForTransport(t).some(o => this.isOrderDeadlineOverdue(o));
      })
      .sort((a, b) => a.oraPlecare.localeCompare(b.oraPlecare))
  );

  readonly activeOverdue = computed(() =>
    this.transportService.transports()
      .filter(t => {
        if (t.status === 'livrat' || t.status === 'sters') return false;
        if (new Date(t.oraSosire).getTime() < Date.now()) return true;
        return this.ordersForTransport(t).some(o => this.isOrderDeadlineOverdue(o));
      })
      .sort((a, b) => a.oraSosire.localeCompare(b.oraSosire))
  );

  readonly whatsappGroups = signal<WhatsAppContact[]>([]);

  readonly deletedTrips = computed(() =>
    this.transportService.transports().filter(t => t.status === 'sters')
  );

  showDeleted          = signal(false);
  showOrderHistory     = signal(false);
  expandedHistoryIds   = signal<Set<string>>(new Set());

  sort_historic      = signal<{col: string; dir: 1|-1}>({ col: 'oraPlecare', dir: -1 });
  sort_deleted       = signal<{col: string; dir: 1|-1}>({ col: 'oraPlecare', dir: -1 });
  sort_orderHistory  = signal<{col: string; dir: 1|-1}>({ col: 'deliveryDate', dir: 1 });
  pg_orderHistory    = signal(0);

  readonly PAGE_SIZE_OPTIONS = [5, 10, 15, 20, 50, 100];
  pageSize = signal(5);

  // ── Pagination ─────────────────────────────────────────────────────────────
  pg_orders        = signal(0);
  pg_active        = signal(0);
  pg_overdueOrders = signal(0);
  pg_overdueTrips  = signal(0);
  pg_historic      = signal(0);
  pg_deleted       = signal(0);

  // ── Sort state ─────────────────────────────────────────────────────────────
  sort_orders        = signal<{col: string; dir: 1|-1}>({ col: 'deliveryDate', dir: 1 });
  sort_overdueOrders = signal<{col: string; dir: 1|-1}>({ col: 'deliveryDate', dir: 1 });
  sort_active        = signal<{col: string; dir: 1|-1}>({ col: 'oraPlecare',   dir: 1 });
  sort_overdueTrips  = signal<{col: string; dir: 1|-1}>({ col: 'oraSosire',    dir: 1 });

  sortOrders(col: string): void {
    const c = this.sort_orders();
    this.sort_orders.set({ col, dir: c.col === col ? (c.dir * -1 as 1|-1) : 1 });
    this.pg_orders.set(0);
  }
  sortOverdueOrders(col: string): void {
    const c = this.sort_overdueOrders();
    this.sort_overdueOrders.set({ col, dir: c.col === col ? (c.dir * -1 as 1|-1) : 1 });
    this.pg_overdueOrders.set(0);
  }
  sortActive(col: string): void {
    const c = this.sort_active();
    this.sort_active.set({ col, dir: c.col === col ? (c.dir * -1 as 1|-1) : 1 });
    this.pg_active.set(0);
  }
  sortOverdueTrips(col: string): void {
    const c = this.sort_overdueTrips();
    this.sort_overdueTrips.set({ col, dir: c.col === col ? (c.dir * -1 as 1|-1) : 1 });
    this.pg_overdueTrips.set(0);
  }

  pgChange(e: { page?: number; rows?: number }, pg: WritableSignal<number>): void {
    if (e.rows && e.rows !== this.pageSize()) {
      this.pageSize.set(e.rows);
      [this.pg_orders, this.pg_active, this.pg_overdueOrders, this.pg_overdueTrips,
       this.pg_historic, this.pg_deleted, this.pg_orderHistory].forEach(s => s.set(0));
    } else {
      pg.set(e.page ?? 0);
    }
  }

  sortDelivery(key: string, col: string): void {
    key === 'orders' ? this.sortOrders(col) : this.sortOverdueOrders(col);
  }
  getDeliverySortSt(key: string): {col: string; dir: 1|-1} {
    return key === 'orders' ? this.sort_orders() : this.sort_overdueOrders();
  }
  sortIcon(st: {col: string; dir: 1|-1}, col: string): string {
    if (st.col !== col) return 'unfold_more';
    return st.dir === 1 ? 'arrow_upward' : 'arrow_downward';
  }

  private _sortOrders(orders: Order[], st: {col: string; dir: 1|-1}): Order[] {
    return [...orders].sort((a, b) => {
      let va: any = 0, vb: any = 0;
      switch (st.col) {
        case 'orderNumber': va = a.orderNumber ?? 0; vb = b.orderNumber ?? 0; break;
        case 'client': va = a.client.name.toLowerCase(); vb = b.client.name.toLowerCase(); break;
        case 'deliveryDate': va = a.deliveryDate ?? '9'; vb = b.deliveryDate ?? '9'; break;
        case 'value': va = this.orderPendingValue(a).tva; vb = this.orderPendingValue(b).tva; break;
        case 'status': va = a.status; vb = b.status; break;
        case 'masa': va = this.orderTotalWeight(a); vb = this.orderTotalWeight(b); break;
      }
      return va < vb ? -st.dir : va > vb ? st.dir : 0;
    });
  }

  sortHistoric(col: string): void {
    const c = this.sort_historic();
    this.sort_historic.set({ col, dir: c.col === col ? (c.dir * -1 as 1|-1) : 1 });
    this.pg_historic.set(0);
  }
  sortDeleted(col: string): void {
    const c = this.sort_deleted();
    this.sort_deleted.set({ col, dir: c.col === col ? (c.dir * -1 as 1|-1) : 1 });
    this.pg_deleted.set(0);
  }
  sortOrderHistory(col: string): void {
    const c = this.sort_orderHistory();
    this.sort_orderHistory.set({ col, dir: c.col === col ? (c.dir * -1 as 1|-1) : 1 });
    this.pg_orderHistory.set(0);
  }

  private _sortOrderHistory(orders: Order[], st: {col: string; dir: 1|-1}): Order[] {
    return [...orders].sort((a, b) => {
      let va: any = '', vb: any = '';
      switch (st.col) {
        case 'orderNumber': va = a.orderNumber ?? 0; vb = b.orderNumber ?? 0; break;
        case 'client':      va = a.client.name;      vb = b.client.name;      break;
        case 'deliveryDate': va = a.deliveryDate ?? a.timestamp; vb = b.deliveryDate ?? b.timestamp; break;
        case 'valoare':     va = this.orderPendingValue(a).tva; vb = this.orderPendingValue(b).tva; break;
        case 'masa':        va = this.orderTotalWeight(a);       vb = this.orderTotalWeight(b);       break;
        case 'status':      va = a.status; vb = b.status; break;
      }
      return va < vb ? -st.dir : va > vb ? st.dir : 0;
    });
  }

  private _sortTrips(trips: Transport[], st: {col: string; dir: 1|-1}): Transport[] {
    return [...trips].sort((a, b) => {
      let va: any = 0, vb: any = 0;
      switch (st.col) {
        case 'masina': va = this.getVehicleName(a.vehicleId); vb = this.getVehicleName(b.vehicleId); break;
        case 'sofer': va = this.getDriverName(a.driverId); vb = this.getDriverName(b.driverId); break;
        case 'oraPlecare': va = a.oraPlecare; vb = b.oraPlecare; break;
        case 'oraSosire': va = a.oraSosire; vb = b.oraSosire; break;
        case 'status': va = a.status; vb = b.status; break;
        case 'valoare': va = this.tripValue(a).tva; vb = this.tripValue(b).tva; break;
        case 'masa': va = this.tripTotalWeight(a); vb = this.tripTotalWeight(b); break;
      }
      return va < vb ? -st.dir : va > vb ? st.dir : 0;
    });
  }

  // ── Sorted + paginated ─────────────────────────────────────────────────────
  readonly deliveryOrdersOnTimePage = computed(() => {
    const sorted = this._sortOrders(this.deliveryOrdersOnTime(), this.sort_orders());
    const ps = this.pageSize(); const s = this.pg_orders() * ps;
    return sorted.slice(s, s + ps);
  });
  readonly deliveryOrdersOverduePage = computed(() => {
    const sorted = this._sortOrders(this.deliveryOrdersOverdue(), this.sort_overdueOrders());
    const ps = this.pageSize(); const s = this.pg_overdueOrders() * ps;
    return sorted.slice(s, s + ps);
  });
  readonly activeOnTimePage = computed(() => {
    const sorted = this._sortTrips(this.activeOnTime(), this.sort_active());
    const ps = this.pageSize(); const s = this.pg_active() * ps;
    return sorted.slice(s, s + ps);
  });
  readonly activeOverduePage = computed(() => {
    const sorted = this._sortTrips(this.activeOverdue(), this.sort_overdueTrips());
    const ps = this.pageSize(); const s = this.pg_overdueTrips() * ps;
    return sorted.slice(s, s + ps);
  });
  readonly historyPage = computed(() => {
    const sorted = this._sortTrips(this.transportService.history(), this.sort_historic());
    const ps = this.pageSize(); const s = this.pg_historic() * ps;
    return sorted.slice(s, s + ps);
  });
  readonly deletedPage = computed(() => {
    const sorted = this._sortTrips(this.deletedTrips(), this.sort_deleted());
    const ps = this.pageSize(); const s = this.pg_deleted() * ps;
    return sorted.slice(s, s + ps);
  });
  readonly orderHistoryPage = computed(() => {
    const sorted = this._sortOrderHistory(this.orderHistoryList(), this.sort_orderHistory());
    const ps = this.pageSize(); const s = this.pg_orderHistory() * ps;
    return sorted.slice(s, s + ps);
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
    private snackBar: MatSnackBar,
    public  catalogsService: CatalogsService,
    private storage: StorageService
  ) {
    this.form = this.fb.group({
      vehicleId:   ['', Validators.required],
      driverId:    ['', Validators.required],
      plecareDate: ['', Validators.required],
      plecareTime: ['', Validators.required],
      sosireDate:  ['', Validators.required],
      sosireTime:  ['', Validators.required],
      helper:      ['']
    }, { validators: [plecareNotInPast, sosireAfterPlecare] });

    this._formVehicleIdSig = toSignal(
      this.form.get('vehicleId')!.valueChanges.pipe(startWith(this.form.get('vehicleId')!.value ?? '')),
      { initialValue: this.form.get('vehicleId')!.value ?? '' }
    );
    this.modalVehicleMaxKg = computed(() => {
      const id = this._formVehicleIdSig!();
      return id ? (this.transportService.getVehicle(id)?.tonajMaxim ?? 0) : 0;
    });
  }

  ngOnInit(): void {
    const contacts = this.storage.get<WhatsAppContact[]>('app_whatsapp_contacts') ?? [];
    this.whatsappGroups.set(contacts.filter(c => c.type === 'group'));
  }

  // ── Modal open/close ──────────────────────────────────────────────────────

  openCreate(): void {
    this.editingId.set(null);
    this.singleOrderMode.set(false);
    this._resetModal();
    this.form.reset({ vehicleId: '', driverId: '', plecareDate: '', plecareTime: '', sosireDate: '', sosireTime: '', helper: '' });
    this.showModal.set(true);
  }

  openCreateForOrder(order: Order): void {
    this.editingId.set(null);
    this.singleOrderMode.set(true);
    this._resetModal();
    this.form.reset({ vehicleId: '', driverId: '', plecareDate: '', plecareTime: '', sosireDate: '', sosireTime: '', helper: '' });
    this.addOrderToModal(order);
    this.showModal.set(true);
  }

  openCreateForVehicleDay(vehicleId: string, day: CalDay): void {
    this.editingId.set(null);
    this.singleOrderMode.set(false);
    this._resetModal();
    this.form.reset({
      vehicleId,
      driverId:    '',
      plecareDate: day.date.toISOString().slice(0, 10),
      plecareTime: '08:00',
      sosireDate:  day.date.toISOString().slice(0, 10),
      sosireTime:  '12:00',
      helper: ''
    });
    this.showModal.set(true);
  }

  openEdit(t: Transport): void {
    this.editingId.set(t.id);
    this.singleOrderMode.set(false);
    this._resetModal();

    const orders = t.deliveries.map(d => this.getOrder(d.orderId)).filter((o): o is Order => !!o);
    this.modalOrders.set(orders);

    const qty: Record<string, Record<number, number>> = {};
    const notes: Record<string, string> = {};
    for (const d of t.deliveries) {
      qty[d.orderId] = {};
      for (const item of d.items) qty[d.orderId][item.productIndex] = item.qty;
      if (d.observatii) notes[d.orderId] = d.observatii;
    }
    this.modalQty.set(qty);
    this.deliveryNotes.set(notes);

    this.form.patchValue({
      vehicleId:   t.vehicleId,
      driverId:    t.driverId,
      plecareDate: t.oraPlecare ? new Date(t.oraPlecare).toISOString().slice(0, 10) : '',
      plecareTime: t.oraPlecare ? this._extractTime(t.oraPlecare) : '',
      sosireDate:  t.oraSosire  ? new Date(t.oraSosire).toISOString().slice(0, 10) : '',
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
    const remaining = this.getRemainingQtyArr(order, this.editingId() ?? undefined);
    this.modalQty.update(m => ({
      ...m,
      [order.id]: Object.fromEntries(remaining.map((q, i) => [i, q]))
    }));
    if (order.client.note) {
      this.deliveryNotes.update(n => ({ ...n, [order.id]: order.client.note }));
    }
    this.orderSearch.set('');
  }

  removeOrderFromModal(orderId: string): void {
    this.modalOrders.update(list => list.filter(o => o.id !== orderId));
    this.modalQty.update(m => { const n = { ...m }; delete n[orderId]; return n; });
    this.deliveryNotes.update(n => { const c = { ...n }; delete c[orderId]; return c; });
  }

  getDeliveryNote(orderId: string): string { return this.deliveryNotes()[orderId] ?? ''; }
  setDeliveryNote(orderId: string, val: string): void {
    this.deliveryNotes.update(n => ({ ...n, [orderId]: val }));
  }

  moveOrderUp(id: string): void {
    this.modalOrders.update(list => {
      const i = list.findIndex(o => o.id === id);
      if (i <= 0) return list;
      const next = [...list];
      [next[i - 1], next[i]] = [next[i], next[i - 1]];
      return next;
    });
  }

  moveOrderDown(id: string): void {
    this.modalOrders.update(list => {
      const i = list.findIndex(o => o.id === id);
      if (i < 0 || i >= list.length - 1) return list;
      const next = [...list];
      [next[i], next[i + 1]] = [next[i + 1], next[i]];
      return next;
    });
  }

  getModalQty(orderId: string, idx: number): number {
    return this.modalQty()[orderId]?.[idx] ?? 0;
  }

  setModalQty(orderId: string, idx: number, val: string | number): void {
    const order = this.modalOrders().find(o => o.id === orderId);
    if (!order) return;
    const max = this.getRemainingQtyArr(order, this.editingId() ?? undefined)[idx] ?? 0;
    const qty = Math.min(max, Math.max(0, parseFloat(String(val)) || 0));
    this.modalQty.update(m => ({ ...m, [orderId]: { ...(m[orderId] ?? {}), [idx]: qty } }));
  }

  modalOrderTotalQty(orderId: string, order: Order): number {
    return order.products.reduce((s, _, i) => s + this.getModalQty(orderId, i), 0);
  }

  modalOrderTotalValue(orderId: string, order: Order): { net: number; tva: number } {
    return order.products.reduce((s, p, i) => {
      const qty = this.getModalQty(orderId, i);
      const price = this.productPrice(p);
      return { net: s.net + price.net * qty, tva: s.tva + price.tva * qty };
    }, { net: 0, tva: 0 });
  }

  productMasa(p: { masaNeta?: number; catalogId?: string; nr: number | string }): number {
    return p.masaNeta ?? this.catalogsService.findProduct(p.catalogId ?? '', p.nr)?.masaNeta ?? 0;
  }

  modalOrderTotalWeight(orderId: string, order: Order): number {
    return order.products.reduce((s, p, i) => {
      return s + this.productMasa(p) * this.getModalQty(orderId, i);
    }, 0);
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

  getOnTripQtyArr(order: Order, excludeId?: string): number[] {
    const qty = new Array(order.products.length).fill(0);
    for (const t of this.transportService.transports()) {
      if (t.status === 'livrat' || t.status === 'anulat' || t.status === 'sters' || t.id === excludeId) continue;
      const d = t.deliveries.find(d => d.orderId === order.id);
      if (!d) continue;
      for (const item of d.items) {
        if (item.productIndex < qty.length) qty[item.productIndex] += item.qty;
      }
    }
    return qty;
  }

  getRemainingQtyArr(order: Order, excludeId?: string): number[] {
    const del   = this.getDeliveredQtyArr(order);
    const onTrip = this.getOnTripQtyArr(order, excludeId);
    return order.products.map((p, i) => Math.max(0, p.qty - (del[i] || 0) - (onTrip[i] || 0)));
  }

  isPartiallyOnTrip(order: Order): boolean {
    return this.transportService.transports()
      .filter(t => t.status !== 'livrat')
      .some(t => t.deliveries.some(d => d.orderId === order.id));
  }

  productPrice(p: { pretFaraTVA?: number; pretCuTVA?: number; catalogId?: string; nr: number | string }): { net: number; tva: number } {
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

  orderPendingValue(order: Order): { net: number; tva: number } {
    const delivered = this.getDeliveredQtyArr(order);
    return order.products.reduce((s, p, i) => {
      const rem = Math.max(0, p.qty - (delivered[i] || 0));
      const price = this.productPrice(p);
      return { net: s.net + rem * price.net, tva: s.tva + rem * price.tva };
    }, { net: 0, tva: 0 });
  }

  orderRemainingValue(order: Order): { net: number; tva: number } {
    const remaining = this.getRemainingQtyArr(order);
    return order.products.reduce((s, p, i) => {
      const price = this.productPrice(p);
      return { net: s.net + remaining[i] * price.net, tva: s.tva + remaining[i] * price.tva };
    }, { net: 0, tva: 0 });
  }

  tripValue(t: Transport): { net: number; tva: number } {
    return this.ordersForTransport(t).reduce((s, order) => {
      const d = t.deliveries.find(del => del.orderId === order.id);
      if (!d) return s;
      const sub = d.items.reduce((si, item) => {
        const p = order.products[item.productIndex];
        if (!p) return si;
        const price = this.productPrice(p);
        return { net: si.net + item.qty * price.net, tva: si.tva + item.qty * price.tva };
      }, { net: 0, tva: 0 });
      return { net: s.net + sub.net, tva: s.tva + sub.tva };
    }, { net: 0, tva: 0 });
  }

  isPartialTripForOrder(t: { deliveries: { orderId: string; items: { qty: number }[] }[] }, order: Order): boolean {
    if (order.status === 'livrat_partial') return true;
    const d = t.deliveries.find(del => del.orderId === order.id);
    if (!d) return false;
    const delivered = this.getDeliveredQtyArr(order);
    const totalRemaining = order.products.reduce((s, p, i) => s + Math.max(0, p.qty - (delivered[i] || 0)), 0);
    const onThisTrip = d.items.reduce((s, item) => s + item.qty, 0);
    return onThisTrip < totalRemaining;
  }

  totalQty(order: Order): number {
    return order.products.reduce((s, p) => s + p.qty, 0);
  }

  orderTotalWeight(o: Order): number {
    return o.products.reduce((s, p) => {
      const masa = p.masaNeta
        ?? this.catalogsService.findProduct(p.catalogId ?? '', p.nr)?.masaNeta
        ?? 0;
      return s + masa * p.qty;
    }, 0);
  }

  tripTotalWeight(t: Transport): number {
    return this.ordersForTransport(t).reduce((sum, order) => {
      const d = t.deliveries.find(del => del.orderId === order.id);
      if (!d) return sum;
      return sum + d.items.reduce((si, item) => {
        const p = order.products[item.productIndex];
        if (!p) return si;
        const masa = p.masaNeta
          ?? this.catalogsService.findProduct(p.catalogId ?? '', p.nr)?.masaNeta
          ?? 0;
        return si + masa * item.qty;
      }, 0);
    }, 0);
  }

  tripWeightWarn(t: Transport): boolean {
    const vehicle = this.transportService.getVehicle(t.vehicleId);
    if (!vehicle?.tonajMaxim) return false;
    return this.tripTotalWeight(t) > vehicle.tonajMaxim;
  }

  fmtWeight(kg: number): string {
    if (kg <= 0) return '';
    return kg >= 1000
      ? `${(kg / 1000).toFixed(2).replace(/\.?0+$/, '')} t`
      : `${kg.toFixed(1).replace(/\.0$/, '')} kg`;
  }

  deliveredTotal(order: Order): number {
    return this.getDeliveredQtyArr(order).reduce((s, q) => s + q, 0);
  }

  remainingTotal(order: Order): number {
    return this.getRemainingQtyArr(order).reduce((s, q) => s + q, 0);
  }

  deliveredProductCount(order: Order): number {
    return this.getDeliveredQtyArr(order).filter(q => q > 0).length;
  }

  orderDeliveredWeight(order: Order): number {
    const delivered = this.getDeliveredQtyArr(order);
    return order.products.reduce((s, p, i) => {
      const masa = p.masaNeta
        ?? this.catalogsService.findProduct(p.catalogId ?? '', p.nr)?.masaNeta
        ?? 0;
      return s + masa * (delivered[i] || 0);
    }, 0);
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
      .map(order => {
        const note = this.getDeliveryNote(order.id).trim();
        const d: TripDelivery = {
          orderId: order.id,
          items: order.products
            .map((_, i) => ({ productIndex: i, qty: this.getModalQty(order.id, i) }))
            .filter(item => item.qty > 0)
        };
        if (note) d.observatii = note;
        return d;
      })
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
      const conflictTrip = overlap.driverTrip ?? overlap.vehicleTrip;
      const who = overlap.vehicle && overlap.driver ? 'Mașina și șoferul'
        : overlap.vehicle ? 'Mașina' : 'Șoferul';
      let msg = `${who} nu este disponibil în această perioadă.`;
      if (conflictTrip) {
        const clients = [...new Set(conflictTrip.deliveries.map(d => {
          const o = this.ordersService.orders().find(ord => ord.id === d.orderId);
          return o?.client.name ?? '';
        }).filter(Boolean))].join(', ');
        const plecareFmt = this.transportService.formatDateTime(conflictTrip.oraPlecare);
        const sosireFmt  = this.transportService.formatDateTime(conflictTrip.oraSosire);
        msg += ` Cursă existentă: ${plecareFmt} → ${sosireFmt}`;
        if (clients) msg += ` (${clients})`;
      }
      this.snackBar.open(msg, 'OK', { duration: 8000 });
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
        const order = this.getOrder(d.orderId);
        if (!order) continue;
        if (!['planificat', 'livrat_partial'].includes(order.status)) {
          this.ordersService.updateOrderStatus(d.orderId, 'planificat');
        }
      }
      this.snackBar.open('Cursă planificată.', '', { duration: 2000 });
    }
    this.showModal.set(false);
  }

  // ── Status transitions ────────────────────────────────────────────────────

  setTripStatus(t: Transport, status: TransportStatus): void {
    if (status === t.status) return;
    if (status === 'livrat' && t.status !== 'in_livrare' && t.status !== 'confirmat_sofer') return;
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

  private tripWhatsAppMsg(t: Transport): string {
    const orders = this.ordersForTransport(t);
    const lines = orders.map(o => `• ${o.client.name}${o.client.address ? ' — ' + o.client.address : ''}`).join('\n');
    return `Cursa:\nPlecare: ${this.transportService.formatDateTime(t.oraPlecare)}\nSosire: ${this.transportService.formatDateTime(t.oraSosire)}\n${lines}`;
  }

  private findPersonByName(name: string): { telefon?: string } | undefined {
    const all = [...this.transportService.helpers(), ...this.transportService.drivers()];
    return all.find(d => d.nume === name);
  }

  helperHasPhone(t: Transport): boolean {
    if (!t.helper) return false;
    const p = this.findPersonByName(t.helper);
    return !!(p as any)?.telefon;
  }

  sendDriverWhatsApp(t: Transport): void {
    const driver = this.transportService.getDriver(t.driverId);
    if (!driver?.telefon) {
      this.snackBar.open('Șoferul nu are număr de telefon configurat.', 'OK', { duration: 3000 });
      return;
    }
    const rawPhone = driver.telefon.replace(/\D/g, '');
    const phone = rawPhone.startsWith('0') ? '4' + rawPhone : rawPhone;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(this.tripWhatsAppMsg(t))}`, '_blank');
    this.transportService.markWaSent(t.id, 'driver');
  }

  sendHelperWhatsApp(t: Transport): void {
    if (!t.helper) return;
    const person = this.findPersonByName(t.helper) as any;
    if (!person?.telefon) {
      this.snackBar.open(`${t.helper} nu are număr de telefon configurat.`, 'OK', { duration: 3000 });
      return;
    }
    const rawPhone = (person.telefon as string).replace(/\D/g, '');
    const phone = rawPhone.startsWith('0') ? '4' + rawPhone : rawPhone;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(this.tripWhatsAppMsg(t))}`, '_blank');
    this.transportService.markWaSent(t.id, 'helper');
  }

  sendGroupWhatsApp(t: Transport, group: WhatsAppContact): void {
    const phone = group.phone.replace(/\D/g, '');
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(this.tripWhatsAppMsg(t))}`, '_blank');
  }

  fmtWaSent(iso: string | undefined): string {
    if (!iso) return '';
    const d = new Date(iso);
    return `${d.toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit' })} ${d.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' })}`;
  }

  notifyDriverDeleted(t: Transport): void {
    const driver = this.transportService.getDriver(t.driverId);
    if (!driver?.telefon) {
      this.snackBar.open('Șoferul nu are număr de telefon.', 'OK', { duration: 2500 });
      return;
    }
    const msg = `Cursa ta din ${this.transportService.formatDateTime(t.oraPlecare)} a fost ANULATĂ.`;
    const rawPhone = driver.telefon.replace(/\D/g, '');
    const phone = rawPhone.startsWith('0') ? '4' + rawPhone : rawPhone;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
  }

  reopenTransport(t: Transport): void {
    this.transportService.setStatus(t.id, 'planificat');
    this.snackBar.open('Cursa a fost redeschisă.', '', { duration: 2000 });
  }

  deleteTransport(t: Transport): void {
    if (!confirm('Muți această cursă în Curse șterse? Comenzile vor reveni la statusul anterior.')) return;
    this.transportService.setStatus(t.id, 'sters');
    const affected = [...new Set(t.deliveries.map(d => d.orderId))];
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
    this.snackBar.open('Cursa a fost mutată în Curse șterse.', '', { duration: 2200 });
  }

  restoreTransport(t: Transport): void {
    this.transportService.setStatus(t.id, 'planificat');
    this.snackBar.open('Cursa a fost redeschisă.', '', { duration: 2000 });
  }

  // ── Calendar helpers ──────────────────────────────────────────────────────

  tripsForVehicleDay(vehicleId: string, day: CalDay): CalBar[] {
    const { dayStart, dayEnd, isToday } = day;
    const duration = dayEnd - dayStart;
    return this.transportService.transports()
      .filter(t => t.vehicleId === vehicleId && t.status !== 'livrat' && t.status !== 'anulat' && t.status !== 'sters')
      .filter(t => {
        const pT = new Date(t.oraPlecare).getTime();
        const sT = new Date(t.oraSosire).getTime();
        if (pT < dayEnd && sT > dayStart) return true;
        // Overdue trips (missed deadline) — show only on today's column
        return isToday && sT <= dayStart;
      })
      .map(t => {
        const pT = new Date(t.oraPlecare).getTime();
        const sT = new Date(t.oraSosire).getTime();
        const overdue = sT <= dayStart;
        if (overdue) {
          // Pin to left edge of today, fixed 6% width
          return { transport: t, leftPct: 0, widthPct: 6, overdue: true };
        }
        const clampedP = Math.max(pT, dayStart);
        const clampedS = Math.min(sT, dayEnd);
        return {
          transport: t,
          leftPct:  Math.max(0, ((clampedP - dayStart) / duration) * 100),
          widthPct: Math.max(1, ((clampedS - clampedP) / duration) * 100)
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

  readonly orderHistoryList = computed<Order[]>(() =>
    this.ordersService.orders()
      .filter(o => o.cuLivrare && !o.superseded && o.status !== 'anulat')
      .sort((a, b) => (a.deliveryDate ?? a.timestamp).localeCompare(b.deliveryDate ?? b.timestamp))
  );

  tripsForOrderHistory(orderId: string): import('../../core/models/transport.model').Transport[] {
    return this.transportService.transports()
      .filter(t => t.status !== 'sters' && t.deliveries.some(d => d.orderId === orderId))
      .sort((a, b) => a.oraPlecare.localeCompare(b.oraPlecare));
  }

  toggleHistoryExpand(orderId: string): void {
    this.expandedHistoryIds.update(ids => {
      const next = new Set(ids);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  }

  tripsForOrder(orderId: string): import('../../core/models/transport.model').Transport[] {
    return this.transportService.transports()
      .filter(t =>
        t.status !== 'livrat' && t.status !== 'sters' && t.status !== 'anulat' &&
        t.deliveries.some(d => d.orderId === orderId)
      )
      .sort((a, b) => a.oraPlecare.localeCompare(b.oraPlecare));
  }

  tripOrderQtyTotal(t: import('../../core/models/transport.model').Transport, orderId: string): number {
    return this.getTripDelivery(t, orderId)?.items.reduce((s, i) => s + i.qty, 0) ?? 0;
  }

  tripOrderWeight(t: import('../../core/models/transport.model').Transport, o: Order): number {
    const d = this.getTripDelivery(t, o.id);
    if (!d) return 0;
    return d.items.reduce((s, item) => {
      const p = o.products[item.productIndex];
      return s + (p?.masaNeta ?? 0) * item.qty;
    }, 0);
  }

  tripOrderValue(t: import('../../core/models/transport.model').Transport, o: Order): { net: number; tva: number } {
    const d = this.getTripDelivery(t, o.id);
    if (!d) return { net: 0, tva: 0 };
    let net = 0, tva = 0;
    for (const item of d.items) {
      const p = o.products[item.productIndex];
      if (!p) continue;
      const pr = this.productPrice(p);
      net += pr.net * item.qty;
      tva += pr.tva * item.qty;
    }
    return { net, tva };
  }

  openBestTripForOrder(o: Order): void {
    const trips = this.tripsForOrderHistory(o.id);
    if (!trips.length) return;
    const t = trips.find(tr => tr.status !== 'livrat') ?? trips[trips.length - 1];
    this.openDelivery(t, o);
  }

  getTripDelivery(t: Transport, orderId: string): import('../../core/models/transport.model').TripDelivery | undefined {
    return t.deliveries.find(d => d.orderId === orderId);
  }

  saveTripDeliveryNote(t: Transport, orderId: string, note: string): void {
    const deliveries = t.deliveries.map(d =>
      d.orderId === orderId ? { ...d, observatii: note.trim() || undefined } : d
    );
    this.transportService.updateTransport(t.id, { deliveries });
  }

  orderTripStatus(o: Order): { label: string; cls: string } {
    const t = this.transportService.transports()
      .filter(tr => tr.status !== 'livrat' && tr.status !== 'anulat' && tr.status !== 'sters')
      .find(tr => tr.deliveries.some(d => d.orderId === o.id));
    if (!t) return { label: 'Neplanificat', cls: 'order-status--unplanned' };
    if (t.status === 'in_livrare') return { label: 'În livrare', cls: 'status-active' };
    const fullyPlanned = this.getRemainingQtyArr(o).every(q => q === 0);
    return fullyPlanned
      ? { label: 'Planificat', cls: 'status-planned' }
      : { label: 'Parțial planificat', cls: 'order-status--partial' };
  }

  private _obsBuffer = new Map<string, string>();

  setObsBuffer(tripId: string, orderId: string, val: string): void {
    this._obsBuffer.set(`${tripId}::${orderId}`, val);
  }

  saveObsBuffer(t: Transport, orderId: string): void {
    const key = `${t.id}::${orderId}`;
    if (!this._obsBuffer.has(key)) return;
    this.saveTripDeliveryNote(t, orderId, this._obsBuffer.get(key)!);
  }

  private _orderObsBuffer = new Map<string, string>();

  setOrderObsBuffer(orderId: string, val: string): void {
    this._orderObsBuffer.set(orderId, val);
  }

  saveOrderObsBuffer(orderId: string): void {
    if (!this._orderObsBuffer.has(orderId)) return;
    this.ordersService.updateOrderObservatii(orderId, this._orderObsBuffer.get(orderId)!);
  }

  deleteOrder(o: Order): void {
    if (!confirm(`Ștergi definitiv comanda #${o.orderNumber} - ${o.client.name}? Acțiunea nu poate fi anulată.`)) return;
    this.ordersService.hardDeleteOrder(o.id);
    this.snackBar.open(`Comanda #${o.orderNumber} a fost ștearsă.`, '', { duration: 2500 });
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

  // ── Inline edit: address ──────────────────────────────────────────────────

  startEditAddress(order: Order): void {
    this.addressEdit.set(order.client.address ?? '');
    this.editingAddressId.set(order.id);
  }

  saveAddress(order: Order): void {
    const newAddress = this.addressEdit();
    this.ordersService.updateOrderClient(order.id, { address: newAddress });
    this.modalOrders.update(list => list.map(o =>
      o.id === order.id ? { ...o, client: { ...o.client, address: newAddress } } : o
    ));
    this.editingAddressId.set(null);
  }

  cancelEditAddress(): void { this.editingAddressId.set(null); }

  // ── Inline edit: deadline ─────────────────────────────────────────────────

  startEditDeadline(order: Order): void {
    this.deadlineDateEdit.set(order.deliveryDate ?? '');
    this.deadlineTimeEdit.set(order.deliveryTime ?? '');
    this.editingDeadlineId.set(order.id);
  }

  saveDeadline(order: Order): void {
    const newDate = this.deadlineDateEdit();
    const newTime = this.deadlineTimeEdit();
    this.ordersService.updateOrderDeliveryDateTime(order.id, newDate, newTime);
    this.modalOrders.update(list => list.map(o =>
      o.id === order.id
        ? { ...o, deliveryDate: newDate || undefined, deliveryTime: newTime || undefined }
        : o
    ));
    this.editingDeadlineId.set(null);
  }

  cancelEditDeadline(): void { this.editingDeadlineId.set(null); }

  // ── Deadline validation ───────────────────────────────────────────────────

  orderDeadlineStatus(order: Order): 'ok' | 'warn' | 'no-deadline' {
    if (!order.deliveryDate) return 'no-deadline';
    const v = this.form.value;
    const from = v.plecareDate && v.plecareTime ? combineDateTime(v.plecareDate, v.plecareTime) : '';
    const to   = v.sosireDate  && v.sosireTime  ? combineDateTime(v.sosireDate,  v.sosireTime)  : '';
    if (!from || !to) return 'no-deadline';

    const [y, mo, d] = order.deliveryDate.split('-').map(Number);
    const deadline = new Date(y, mo - 1, d);
    if (order.deliveryTime) {
      const [h, m] = order.deliveryTime.split(':').map(Number);
      deadline.setHours(h, m, 0, 0);
    } else {
      deadline.setHours(23, 59, 0, 0);
    }
    const ms = deadline.getTime();
    return ms >= new Date(from).getTime() && ms <= new Date(to).getTime() ? 'ok' : 'warn';
  }

  get hasDeadlineConflicts(): boolean {
    return this.modalOrders().some(o => this.orderDeadlineStatus(o) === 'warn');
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

  tripOrderDeadlineWarn(t: Transport, order: Order): boolean {
    if (!order.deliveryDate) return false;
    const [y, mo, d] = order.deliveryDate.split('-').map(Number);
    const deadline = new Date(y, mo - 1, d);
    if (order.deliveryTime) {
      const [h, m] = order.deliveryTime.split(':').map(Number);
      deadline.setHours(h, m, 0, 0);
    } else {
      deadline.setHours(23, 59, 0, 0);
    }
    return new Date(t.oraPlecare).getTime() > deadline.getTime();
  }

  statusLabel(s: string): string {
    switch (s) {
      case 'planificat':     return 'Așteptare confirmare';
      case 'confirmat_sofer': return 'Confirmat șofer';
      case 'in_livrare':    return 'În livrare';
      case 'livrat':        return 'Livrat';
      case 'anulat':        return 'Anulat';
      default:              return s;
    }
  }

  statusClass(s: string): string {
    switch (s) {
      case 'planificat':     return 'status-planned';
      case 'confirmat_sofer': return 'status-confirmed';
      case 'in_livrare':    return 'status-active';
      case 'livrat':        return 'status-done';
      case 'anulat':        return 'status-cancelled';
      default:              return '';
    }
  }

  isHelperBusy(t: Transport): boolean {
    if (!t.helper) return false;
    const person = this.transportService.helpers().find(d => d.nume === t.helper)
                ?? this.transportService.drivers().find(d => d.nume === t.helper);
    if (!person) return false;
    const pA = new Date(t.oraPlecare).getTime(), sA = new Date(t.oraSosire).getTime();
    const eA = effectiveEndMs(pA, sA);
    return this.transportService.active()
      .filter(other => other.id !== t.id && other.helper === t.helper)
      .some(other => {
        const pB = new Date(other.oraPlecare).getTime(), sB = new Date(other.oraSosire).getTime();
        return pA < effectiveEndMs(pB, sB) && pB < eA;
      });
  }

  get minPlecareTime(): string {
    const pd = this.form.get('plecareDate')?.value as string;
    if (!pd || pd !== this.todayStr) return '';
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  }

  get minSosireDate(): string {
    return (this.form.get('plecareDate')?.value as string) || this.todayStr;
  }

  get minSosireTime(): string {
    const pd = this.form.get('plecareDate')?.value as string;
    const sd = this.form.get('sosireDate')?.value as string;
    const pt = this.form.get('plecareTime')?.value as string;
    if (sd && pd && sd === pd && pt) return pt;
    return '';
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
    this.deliveryNotes.set({});
    this.orderSearch.set('');
  }

  private _hasRemainingItemsExcluding(order: Order, excludeId?: string): boolean {
    const del    = this.getDeliveredQtyArr(order);
    const onTrip = this.getOnTripQtyArr(order, excludeId);
    return order.products.some((p, i) => p.qty > (del[i] || 0) + (onTrip[i] || 0));
  }

  private _extractTime(iso: string): string {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  private _checkOverlap(plecare: string, sosire: string, vehicleId: string, driverId: string, excludeId?: string): { vehicle: boolean; driver: boolean; driverTrip?: Transport; vehicleTrip?: Transport } {
    const pA = new Date(plecare).getTime(), sA = new Date(sosire).getTime();
    const eA = effectiveEndMs(pA, sA);
    const others = this.transportService.transports().filter(t => t.status !== 'livrat' && t.status !== 'anulat' && t.status !== 'sters' && t.id !== excludeId);
    let vehicle = false, driver = false;
    let driverTrip: Transport | undefined, vehicleTrip: Transport | undefined;
    for (const t of others) {
      const pB = new Date(t.oraPlecare).getTime(), sB = new Date(t.oraSosire).getTime();
      const eB = effectiveEndMs(pB, sB);
      if (pA < eB && pB < eA) {
        if (t.vehicleId === vehicleId && !vehicleTrip) { vehicle = true; vehicleTrip = t; }
        if (t.driverId  === driverId  && !driverTrip)  { driver  = true; driverTrip  = t; }
      }
    }
    return { vehicle, driver, driverTrip, vehicleTrip };
  }

  private _busyInForm(): { vehicleIds: Set<string>; driverIds: Set<string> } {
    const pd = this.form.get('plecareDate')?.value as string;
    const pt = this.form.get('plecareTime')?.value as string;
    const sd = this.form.get('sosireDate')?.value as string;
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
