import { Component, computed, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TransportService } from '../../core/services/transport.service';
import { OrdersService } from '../../core/services/orders.service';
import { AuthService } from '../../core/services/auth.service';
import { StorageService } from '../../core/services/storage.service';
import { CatalogsService } from '../../core/services/catalogs.service';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Transport, TripDelivery, TripOrderItem } from '../../core/models/transport.model';
import { Order, OrderProduct } from '../../core/models/order.model';
import { WhatsAppContact } from '../../core/models/whatsapp.model';
import { MobileNavComponent } from '../../shared/mobile-nav/mobile-nav.component';

type TabKey = 'active' | 'done';

@Component({
  selector: 'app-mobile-transport',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, MatSnackBarModule, MobileNavComponent],
  templateUrl: './mobile-transport.component.html',
  styleUrl: './mobile-transport.component.scss'
})
export class MobileTransportComponent implements OnInit {
  activeTab  = signal<TabKey>('active');
  expandedId = signal<string | null>(null);

  // Admin form
  showForm    = signal(false);
  editingId   = signal<string | null>(null);
  formVehicleId   = '';
  formDriverId    = '';
  formHelperName  = '';
  formPlecareDate = '';
  formPlecareTime = '08:00';
  formSosireDate  = '';
  formSosireTime  = '18:00';
  formSelectedOrderIds = signal<Set<string>>(new Set());

  // UI toggles
  showPending        = signal(false);
  showDeleted        = signal(false);
  expandedPendingId  = signal<string | null>(null);

  // WA groups
  waGroups = signal<WhatsAppContact[]>([]);

  constructor(
    public  transportService: TransportService,
    public  ordersService: OrdersService,
    public  auth: AuthService,
    private storage: StorageService,
    private catalogsService: CatalogsService,
    private snackBar: MatSnackBar
  ) {}

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

  readonly displayList = computed(() =>
    this.activeTab() === 'done' ? this.done() : this.active()
  );

  readonly pendingOrders = computed<Order[]>(() =>
    this.ordersService.orders().filter(o => {
      if (!o.cuLivrare || o.superseded) return false;
      if (!['acceptat','livrat_partial','planificat'].includes(o.status)) return false;
      if (!this._hasRemainingItems(o)) return false;
      return !this.transportService.transports()
        .some(t => ['planificat','confirmat_sofer','in_livrare'].includes(t.status) &&
                   t.deliveries.some(d => d.orderId === o.id));
    }).sort((a, b) => (a.deliveryDate ?? a.timestamp).localeCompare(b.deliveryDate ?? b.timestamp))
  );

  readonly formEligibleOrders = computed<Order[]>(() => {
    const editId = this.editingId();
    const tripOrderIds = editId
      ? new Set((this.transportService.transports().find(t => t.id === editId)?.deliveries ?? []).map(d => d.orderId))
      : new Set<string>();

    return this.ordersService.orders().filter(o => {
      if (o.superseded || !o.cuLivrare) return false;
      if (!['acceptat','livrat_partial','planificat'].includes(o.status)) return false;
      if (tripOrderIds.has(o.id)) return true;
      return this._hasRemainingItems(o);
    }).sort((a, b) => (a.deliveryDate ?? a.timestamp).localeCompare(b.deliveryDate ?? b.timestamp));
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

  togglePendingExpand(orderId: string): void {
    this.expandedPendingId.update(v => v === orderId ? null : orderId);
  }

  mapsLink(address: string): string {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────

  openCreate(preselect?: string): void {
    this.editingId.set(null);
    this.formVehicleId = '';
    this.formDriverId  = '';
    this.formHelperName = '';
    const today = new Date().toISOString().slice(0, 10);
    this.formPlecareDate = today; this.formPlecareTime = '08:00';
    this.formSosireDate  = today; this.formSosireTime  = '18:00';
    this.formSelectedOrderIds.set(preselect ? new Set([preselect]) : new Set());
    this.showForm.set(true);
  }

  openEdit(t: Transport): void {
    this.editingId.set(t.id);
    this.formVehicleId   = t.vehicleId;
    this.formDriverId    = t.driverId;
    this.formHelperName  = t.helper ?? '';
    this.formPlecareDate = t.oraPlecare.slice(0, 10);
    this.formPlecareTime = t.oraPlecare.slice(11, 16);
    this.formSosireDate  = t.oraSosire.slice(0, 10);
    this.formSosireTime  = t.oraSosire.slice(11, 16);
    const ids = new Set<string>();
    t.deliveries.forEach(d => ids.add(d.orderId));
    this.formSelectedOrderIds.set(ids);
    this.showForm.set(true);
  }

  closeForm(): void { this.showForm.set(false); }

  toggleOrderInForm(orderId: string): void {
    this.formSelectedOrderIds.update(set => {
      const copy = new Set(set);
      if (copy.has(orderId)) copy.delete(orderId); else copy.add(orderId);
      return copy;
    });
  }

  save(): void {
    if (!this.formVehicleId || !this.formDriverId) {
      this.snackBar.open('Selectați mașina și șoferul.', '', { duration: 2500 }); return;
    }
    if (!this.formPlecareDate || !this.formSosireDate) {
      this.snackBar.open('Completați datele de plecare și sosire.', '', { duration: 2500 }); return;
    }
    if (this.formSelectedOrderIds().size === 0) {
      this.snackBar.open('Adaugă cel puțin o comandă la cursă.', '', { duration: 2500 }); return;
    }

    const oraPlecare = `${this.formPlecareDate}T${this.formPlecareTime}:00`;
    const oraSosire  = `${this.formSosireDate}T${this.formSosireTime}:00`;

    if (new Date(oraPlecare) < new Date()) {
      this.snackBar.open('Ora de plecare nu poate fi în trecut.', '', { duration: 3500 }); return;
    }

    if (oraSosire <= oraPlecare) {
      this.snackBar.open('Data/ora de sosire trebuie să fie după plecare.', '', { duration: 3000 }); return;
    }

    const editId = this.editingId();
    const existingTrip = editId ? this.transportService.transports().find(t => t.id === editId) : undefined;
    const deliveries: TripDelivery[] = [];

    for (const orderId of this.formSelectedOrderIds()) {
      const order = this.ordersService.orders().find(o => o.id === orderId);
      if (!order) continue;
      const items: TripOrderItem[] = [];
      order.products.forEach((_, productIndex) => {
        const rem = this._getRemainingQty(order, productIndex, editId);
        if (rem > 0) items.push({ productIndex, qty: rem });
      });
      if (items.length > 0) {
        const del: TripDelivery = { orderId, items };
        const existingObs = existingTrip?.deliveries.find(d => d.orderId === orderId)?.observatii;
        if (existingObs) del.observatii = existingObs;
        deliveries.push(del);
      }
    }

    if (deliveries.length === 0) {
      this.snackBar.open('Nu există cantități disponibile pentru comenzile selectate.', '', { duration: 3000 }); return;
    }

    const overlap = this._checkOverlap(oraPlecare, oraSosire, this.formVehicleId, this.formDriverId, editId);
    if (overlap.vehicle || overlap.driver) {
      const who = overlap.vehicle && overlap.driver ? 'Mașina și șoferul'
        : overlap.vehicle ? 'Mașina' : 'Șoferul';
      this.snackBar.open(`${who} nu este disponibil în această perioadă.`, 'OK', { duration: 5000 }); return;
    }

    const helperName = this.formHelperName.trim() || undefined;
    if (helperName) {
      const pA = new Date(oraPlecare).getTime(), sA = new Date(oraSosire).getTime();
      const eA = this._effectiveEndMs(pA, sA);
      const helperBusy = this.transportService.transports()
        .filter(t => t.status !== 'livrat' && t.status !== 'anulat' && t.status !== 'sters' && t.id !== editId && t.helper === helperName)
        .some(t => {
          const pB = new Date(t.oraPlecare).getTime(), sB = new Date(t.oraSosire).getTime();
          return pA < this._effectiveEndMs(pB, sB) && pB < eA;
        });
      if (helperBusy) {
        this.snackBar.open(`${helperName} este deja în cursă. Alege altă persoană.`, 'OK', { duration: 5000 }); return;
      }
    }

    if (editId) {
      this.transportService.updateTransport(editId, {
        vehicleId: this.formVehicleId, driverId: this.formDriverId,
        helper: helperName, deliveries, oraPlecare, oraSosire
      });
      this.snackBar.open('Cursa actualizată.', '', { duration: 2000 });
    } else {
      this.transportService.createTransport({
        vehicleId: this.formVehicleId, driverId: this.formDriverId,
        helper: helperName, deliveries, oraPlecare, oraSosire
      });
      for (const orderId of this.formSelectedOrderIds()) {
        const order = this.ordersService.orders().find(o => o.id === orderId);
        if (order && order.status === 'acceptat') this.ordersService.updateOrderStatus(orderId, 'planificat');
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
    return t.deliveries.find(d => d.orderId === orderId)?.observatii ?? '';
  }

  setObsBuffer(tripId: string, orderId: string, val: string): void {
    this._obsBuffer.set(`${tripId}::${orderId}`, val);
  }

  saveObsBuffer(t: Transport, orderId: string): void {
    const key = `${t.id}::${orderId}`;
    if (!this._obsBuffer.has(key)) return;
    const note = this._obsBuffer.get(key)!;
    const deliveries = t.deliveries.map(d =>
      d.orderId === orderId ? { ...d, observatii: note.trim() || undefined } : d
    );
    this.transportService.updateTransport(t.id, { deliveries });
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

  private _hasRemainingItems(order: Order): boolean {
    return order.products.some((_, i) => this._getRemainingQty(order, i) > 0);
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
