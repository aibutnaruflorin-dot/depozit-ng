import { Component, computed, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TransportService } from '../../core/services/transport.service';
import { OrdersService } from '../../core/services/orders.service';
import { AuthService } from '../../core/services/auth.service';
import { StorageService } from '../../core/services/storage.service';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Transport, TripDelivery, TripOrderItem } from '../../core/models/transport.model';
import { Order } from '../../core/models/order.model';
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
  showPending = signal(false);
  showDeleted = signal(false);

  // WA groups
  waGroups = signal<WhatsAppContact[]>([]);

  constructor(
    public  transportService: TransportService,
    public  ordersService: OrdersService,
    public  auth: AuthService,
    private storage: StorageService,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    const contacts = this.storage.get<WhatsAppContact[]>('app_whatsapp_contacts') ?? [];
    this.waGroups.set(contacts.filter(c => c.type === 'group'));
  }

  // ── Core computed ─────────────────────────────────────────────────────────

  readonly active = computed(() =>
    this.transportService.transports()
      .filter(t => ['in_livrare','confirmat_sofer','planificat'].includes(t.status))
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

  isOverdue(t: Transport): boolean {
    return !['livrat','anulat','sters'].includes(t.status) &&
      new Date(t.oraSosire).getTime() < Date.now();
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

  tripValue(t: Transport): number {
    let total = 0;
    for (const del of t.deliveries) {
      const order = this.ordersService.orders().find(o => o.id === del.orderId);
      if (!order) continue;
      for (const item of del.items) {
        const p = order.products[item.productIndex];
        if (p) total += (p.pretCuTVA ?? (p.pretFaraTVA ? p.pretFaraTVA * 1.19 : 0)) * item.qty;
      }
    }
    return total;
  }

  tripWeight(t: Transport): number {
    let total = 0;
    for (const del of t.deliveries) {
      const order = this.ordersService.orders().find(o => o.id === del.orderId);
      if (!order) continue;
      for (const item of del.items) {
        const p = order.products[item.productIndex];
        if (p) total += (p.masaNeta ?? 0) * item.qty;
      }
    }
    return total;
  }

  fmtWeight(kg: number): string {
    return kg >= 1000 ? (kg / 1000).toFixed(2) + ' t' : Math.round(kg) + ' kg';
  }

  toggleExpand(id: string): void { this.expandedId.update(v => v === id ? null : id); }

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
      this.snackBar.open('Adăugați cel puțin o comandă pe cursă.', '', { duration: 2500 }); return;
    }

    const oraPlecare = `${this.formPlecareDate}T${this.formPlecareTime}:00`;
    const oraSosire  = `${this.formSosireDate}T${this.formSosireTime}:00`;

    if (oraSosire <= oraPlecare) {
      this.snackBar.open('Sosirea trebuie să fie după plecare.', '', { duration: 2500 }); return;
    }

    const editId = this.editingId();
    const deliveries: TripDelivery[] = [];

    for (const orderId of this.formSelectedOrderIds()) {
      const order = this.ordersService.orders().find(o => o.id === orderId);
      if (!order) continue;
      const items: TripOrderItem[] = [];
      order.products.forEach((_, productIndex) => {
        const rem = this._getRemainingQty(order, productIndex, editId);
        if (rem > 0) items.push({ productIndex, qty: rem });
      });
      if (items.length > 0) deliveries.push({ orderId, items });
    }

    if (deliveries.length === 0) {
      this.snackBar.open('Nu există cantități disponibile pentru comenzile selectate.', '', { duration: 3000 }); return;
    }

    if (editId) {
      this.transportService.updateTransport(editId, {
        vehicleId: this.formVehicleId, driverId: this.formDriverId,
        helper: this.formHelperName || undefined, deliveries, oraPlecare, oraSosire
      });
      this.snackBar.open('Cursa a fost actualizată.', '', { duration: 2000, panelClass: ['snack-success'] });
    } else {
      this.transportService.createTransport({
        vehicleId: this.formVehicleId, driverId: this.formDriverId,
        helper: this.formHelperName || undefined, deliveries, oraPlecare, oraSosire
      });
      for (const orderId of this.formSelectedOrderIds()) {
        const order = this.ordersService.orders().find(o => o.id === orderId);
        if (order && order.status === 'acceptat') this.ordersService.updateOrderStatus(orderId, 'planificat');
      }
      this.snackBar.open('Cursa a fost creată.', '', { duration: 2000, panelClass: ['snack-success'] });
    }
    this.closeForm();
  }

  deleteTransport(t: Transport): void {
    if (!confirm(`Ștergi cursa din ${this.fmtDate(t.oraPlecare)}?\nComenzi aferente vor reveni la "Acceptat".`)) return;
    this.transportService.setStatus(t.id, 'sters');
    for (const del of t.deliveries) {
      const order = this.ordersService.orders().find(o => o.id === del.orderId);
      if (!order) continue;
      const onOther = this.transportService.transports().some(tr =>
        tr.id !== t.id &&
        ['planificat','confirmat_sofer','in_livrare'].includes(tr.status) &&
        tr.deliveries.some(d => d.orderId === del.orderId)
      );
      if (!onOther && order.status === 'planificat') this.ordersService.updateOrderStatus(del.orderId, 'acceptat');
    }
    this.expandedId.set(null);
    this.snackBar.open('Cursa a fost ștearsă.', '', { duration: 2000 });
  }

  restoreTransport(t: Transport): void {
    if (!confirm('Redeschizi cursa ca "Așteptare confirmare"?')) return;
    this.transportService.setStatus(t.id, 'planificat');
    this.snackBar.open('Cursa a fost redeschisă.', '', { duration: 2000 });
  }

  // ── WhatsApp ──────────────────────────────────────────────────────────────

  sendDriverWhatsApp(t: Transport): void {
    const driver = this.transportService.getDriver(t.driverId);
    if (!driver?.telefon) { this.snackBar.open('Șoferul nu are număr de telefon.', '', { duration: 2500 }); return; }
    const orders = this.ordersForTransport(t);
    const phone  = driver.telefon.replace(/\D/g, '');
    const msg    = this._buildDriverMsg(t, driver.nume, orders);
    window.open(`https://wa.me/${phone.startsWith('0') ? '4' + phone : phone}?text=${encodeURIComponent(msg)}`, '_blank');
    this.transportService.markWaSent(t.id, 'driver');
  }

  sendGroupWhatsApp(t: Transport, contact: WhatsAppContact): void {
    const orders = this.ordersForTransport(t);
    const msg    = this._buildGroupMsg(t, orders);
    window.open(`https://wa.me/${contact.phone.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`, '_blank');
  }

  private _buildDriverMsg(t: Transport, driverName: string, orders: Order[]): string {
    const v = this.transportService.getVehicle(t.vehicleId);
    const veh = v?.alias || v?.denumire || t.vehicleId;
    let msg = `Bună ziua, ${driverName}!\n\nAi planificată o cursă cu ${veh}:\nPlecare: ${this.fmtDT(t.oraPlecare)}\nRetur estimat: ${this.fmtDT(t.oraSosire)}\n\n`;
    orders.forEach((o, i) => { msg += `Stop ${i + 1}: ${o.client.name}${o.client.address ? ' — ' + o.client.address : ''}\n`; });
    return msg;
  }

  private _buildGroupMsg(t: Transport, orders: Order[]): string {
    const v = this.transportService.getVehicle(t.vehicleId);
    const veh = v?.alias || v?.denumire || t.vehicleId;
    const drv = this.transportService.getDriver(t.driverId);
    let msg = `Cursă planificată — ${veh}\n${drv ? 'Șofer: ' + drv.nume + '\n' : ''}Plecare: ${this.fmtDT(t.oraPlecare)}\n\n`;
    orders.forEach((o, i) => { msg += `Stop ${i + 1}: ${o.client.name}${o.client.address ? ' — ' + o.client.address : ''}\n`; });
    return msg;
  }

  // ── Private ───────────────────────────────────────────────────────────────

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
