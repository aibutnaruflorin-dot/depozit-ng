import { Component, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormGroup, FormControl } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { Order } from '../../core/models/order.model';
import { User } from '../../core/models/user.model';
import { WhatsAppContact } from '../../core/models/whatsapp.model';
import { AuthService } from '../../core/services/auth.service';
import { CatalogsService } from '../../core/services/catalogs.service';
import { OrdersService, generateId } from '../../core/services/orders.service';
import { StorageService } from '../../core/services/storage.service';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { provideNativeDateAdapter } from '@angular/material/core';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { BarcodeComponent } from '../../shared/barcode.component';
import { AddProductsModalComponent } from '../../shared/add-products-modal/add-products-modal.component';

function sortByFamily(orders: Order[]): Order[] {
  const families: Order[][] = [];
  const visited = new Set<string>();
  for (const order of orders) {
    if (visited.has(order.id)) continue;
    let root = order;
    for (let i = 0; i < 50; i++) {
      if (!root.revisedFromId) break;
      const parent = orders.find(o => o.id === root.revisedFromId);
      if (!parent) break;
      root = parent;
    }
    if (visited.has(root.id)) continue;
    const family: Order[] = [];
    let cur: Order | undefined = root;
    while (cur && !visited.has(cur.id)) {
      family.push(cur);
      visited.add(cur.id);
      cur = orders.find(o => o.revisedFromId === cur!.id);
    }
    families.push(family);
  }
  families.sort((a, b) =>
    b[b.length - 1].timestamp.localeCompare(a[a.length - 1].timestamp)
  );
  return families.flat();
}

@Component({
  selector: 'app-history-all',
  standalone: true,
  providers: [provideNativeDateAdapter()],
  imports: [
    CommonModule, FormsModule, ReactiveFormsModule,
    MatButtonModule, MatIconModule, MatSnackBarModule, MatTooltipModule,
    MatDatepickerModule, MatFormFieldModule, MatInputModule, MatMenuModule, MatDividerModule,
    TableModule, TagModule, BarcodeComponent, AddProductsModalComponent
  ],
  templateUrl: './history-all.component.html',
  styleUrl:    './history-all.component.scss'
})
export class HistoryAllComponent {
  readonly dateRangeForm = new FormGroup({
    start: new FormControl<Date | null>(null),
    end:   new FormControl<Date | null>(null),
  });
  private readonly _dateRange = toSignal(this.dateRangeForm.valueChanges, {
    initialValue: this.dateRangeForm.value
  });

  readonly deliveryRangeForm = new FormGroup({
    start: new FormControl<Date | null>(null),
    end:   new FormControl<Date | null>(null),
  });
  private readonly _deliveryRange = toSignal(this.deliveryRangeForm.valueChanges, {
    initialValue: this.deliveryRangeForm.value
  });

  addProductsOrderId = signal<string | null>(null);
  readonly addProductsOrder = computed(() => {
    const id = this.addProductsOrderId();
    return id ? this.ordersService.orders().find(o => o.id === id) ?? null : null;
  });

  canAddProducts(order: Order): boolean {
    const open = ['trimis', 'acceptat', 'planificat', 'livrat_partial'];
    if (!open.includes(order.status) || order.superseded) return false;
    const s = this.auth.session();
    return !!s && (s.role === 'admin' || order.agent.id === s.userId);
  }

  filterAgent   = signal('');
  filterNr      = signal('');
  filterClient  = signal('');
  filterPhone   = signal('');
  filterStatus  = signal('');
  filterLivrare = signal<'' | 'cu' | 'fara'>('');
  filterAddress = signal('');
  sortField     = signal<string>('');
  sortOrder     = signal<1|-1>(1);
  hideSuperseded = signal(true);

  expandedRows = signal<Record<string, boolean>>({});
  private _editQty = signal<Record<string, number | undefined>>({});
  readonly editQtyMap = this._editQty.asReadonly();

  readonly todayStr = new Date().toISOString().slice(0, 10);

  editingAddressId  = signal<string | null>(null);
  editAddressVal    = '';
  editingPhoneId    = signal<string | null>(null);
  editPhoneVal      = '';
  editingDeliveryId = signal<string | null>(null);
  editDeliveryDate  = '';
  editDeliveryTime  = '';

  readonly agents = computed(() => {
    const users = this.storage.get<User[]>('app_users') || [];
    return users.map(u => ({ id: String(u.id), name: u.name }));
  });

  readonly filtered = computed(() => {
    const agent      = this.filterAgent();
    const nr         = this.filterNr().trim().replace('#', '');
    const client     = this.filterClient().trim().toLowerCase();
    const phone      = this.filterPhone().trim();
    const status     = this.filterStatus();
    const livrare    = this.filterLivrare();
    const address    = this.filterAddress().trim().toLowerCase();
    const dateRange  = this._dateRange();
    const delivRange = this._deliveryRange();

    let orders = this.ordersService.orders();
    if (agent)           orders = orders.filter(o => String(o.agent?.id) === agent);
    if (nr)              orders = orders.filter(o => String(o.orderNumber ?? '').includes(nr));
    if (client)          orders = orders.filter(o => o.client?.name?.toLowerCase().includes(client));
    if (phone)           orders = orders.filter(o => (o.client?.phone ?? '').includes(phone));
    if (livrare === 'cu')   orders = orders.filter(o => !!o.cuLivrare);
    if (livrare === 'fara') orders = orders.filter(o => !o.cuLivrare);
    if (address)         orders = orders.filter(o => (o.client?.address ?? '').toLowerCase().includes(address));
    if (status) orders = orders.filter(o =>
      status === 'În așteptare'   ? (o.status === 'trimis' && !o.superseded) :
      status === 'Acceptată'      ? o.status === 'acceptat' :
      status === 'Anulată'        ? o.status === 'anulat' :
      status === 'Planificată'    ? o.status === 'planificat' :
      status === 'În livrare'     ? o.status === 'in_livrare' :
      status === 'Livrată'        ? o.status === 'livrat' : true
    );
    if (dateRange.start) {
      const from = this._localDate(dateRange.start);
      orders = orders.filter(o => this._localDate(new Date(o.timestamp)) >= from);
    }
    if (dateRange.end) {
      const to = this._localDate(dateRange.end);
      orders = orders.filter(o => this._localDate(new Date(o.timestamp)) <= to);
    }
    if (delivRange.start) {
      const from = this._localDate(delivRange.start);
      orders = orders.filter(o => !!o.deliveryDate && o.deliveryDate >= from);
    }
    if (delivRange.end) {
      const to = this._localDate(delivRange.end);
      orders = orders.filter(o => !!o.deliveryDate && o.deliveryDate <= to);
    }
    return orders;
  });

  readonly sortedFiltered = computed(() => {
    const field = this.sortField();
    const dir   = this.sortOrder();
    let orders = this.hideSuperseded()
      ? this.filtered().filter(o => !o.superseded)
      : this.filtered();

    if (field) {
      return [...orders].sort((a, b) => {
        let va: any, vb: any;
        switch (field) {
          case 'nr':      va = a.orderNumber ?? 0;      vb = b.orderNumber ?? 0;      break;
          case 'data':    va = a.timestamp;             vb = b.timestamp;             break;
          case 'client':  va = a.client?.name ?? '';    vb = b.client?.name ?? '';    break;
          case 'telefon': va = a.client?.phone ?? '';   vb = b.client?.phone ?? '';   break;
          case 'livrare': va = a.cuLivrare ? 1 : 0;    vb = b.cuLivrare ? 1 : 0;    break;
          case 'adresa':  va = a.client?.address ?? ''; vb = b.client?.address ?? ''; break;
          case 'termen':  va = a.deliveryDate ?? '';    vb = b.deliveryDate ?? '';    break;
          case 'agent':   va = a.agent?.name ?? '';     vb = b.agent?.name ?? '';     break;
          case 'produse': va = a.products.length;            vb = b.products.length;            break;
          case 'net':     va = this.orderTotalFaraTVA(a); vb = this.orderTotalFaraTVA(b); break;
          case 'tva':     va = this.orderTotalCuTVA(a);   vb = this.orderTotalCuTVA(b);   break;
          case 'status':  va = a.status;                  vb = b.status;                  break;
          default: return 0;
        }
        if (typeof va === 'string') return dir * va.localeCompare(vb, 'ro');
        return dir * ((va as number) - (vb as number));
      });
    }
    return sortByFamily(orders);
  });

  readonly whatsappContacts = computed<WhatsAppContact[]>(() =>
    this.storage.get<WhatsAppContact[]>('app_whatsapp_contacts') ?? []
  );

  constructor(
    private auth: AuthService,
    public  catalogsService: CatalogsService,
    private ordersService: OrdersService,
    private storage: StorageService,
    private snackBar: MatSnackBar
  ) {}

  private _localDate(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  sort(field: string): void {
    if (this.sortField() === field) {
      this.sortOrder.update(o => (o === 1 ? -1 : 1));
    } else {
      this.sortField.set(field);
      this.sortOrder.set(1);
    }
  }

  sortIcon(field: string): string {
    if (this.sortField() !== field) return 'unfold_more';
    return this.sortOrder() === 1 ? 'arrow_upward' : 'arrow_downward';
  }

  isPending(order: Order): boolean {
    return order.status === 'trimis' && !order.superseded;
  }

  getCodExtern(p: import('../../core/models/order.model').OrderProduct): string {
    if (p.codExtern) return p.codExtern;
    if (!p.catalogId) return '';
    const prod = this.catalogsService.productsFor([p.catalogId]).find(cp => String(cp.nr) === String(p.nr));
    return prod?.codExtern ?? '';
  }

  hasQtyChanges(order: Order): boolean {
    return order.products.some((p, i) => {
      const edited = this._editQty()[this.ekey(order.id, i)];
      return edited !== undefined && edited !== p.qty;
    });
  }

  pFaraTVA(p: { pretFaraTVA?: number; pretCuTVA?: number; catalogId?: string; nr: number | string }): number | null {
    if (p.pretFaraTVA != null) return p.pretFaraTVA;
    if (p.catalogId) return this.catalogsService.findProduct(p.catalogId, p.nr)?.pretFaraTVA ?? null;
    return null;
  }
  pCuTVA(p: { pretFaraTVA?: number; pretCuTVA?: number; catalogId?: string; nr: number | string }): number | null {
    if (p.pretCuTVA != null) return p.pretCuTVA;
    if (p.catalogId) return this.catalogsService.findProduct(p.catalogId, p.nr)?.pretCuTVA ?? null;
    return null;
  }
  orderTotalFaraTVA(order: Order): number {
    return order.products.reduce((s, p) => s + (this.pFaraTVA(p) ?? 0) * p.qty, 0);
  }
  orderTotalCuTVA(order: Order): number {
    return order.products.reduce((s, p) => s + (this.pCuTVA(p) ?? 0) * p.qty, 0);
  }
  editTotalFaraTVA(order: Order): number {
    return order.products.reduce((s, p, j) => {
      const qty = this.editQtyMap()[this.ekey(order.id, j)] ?? p.qty;
      return s + (this.pFaraTVA(p) ?? 0) * qty;
    }, 0);
  }
  editTotalCuTVA(order: Order): number {
    return order.products.reduce((s, p, j) => {
      const qty = this.editQtyMap()[this.ekey(order.id, j)] ?? p.qty;
      return s + (this.pCuTVA(p) ?? 0) * qty;
    }, 0);
  }

  reset(): void {
    this.filterAgent.set(''); this.filterClient.set('');
    this.filterNr.set(''); this.filterPhone.set(''); this.filterStatus.set('');
    this.filterLivrare.set(''); this.filterAddress.set('');
    this.sortField.set(''); this.sortOrder.set(1);
    this.dateRangeForm.reset();
    this.deliveryRangeForm.reset();
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleString('ro-RO');
  }

  shortDate(iso: string): string {
    return new Date(iso).toLocaleString('ro-RO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  getAncestorChain(order: Order): string {
    const all = this.ordersService.orders();
    const chain: string[] = [];
    let cur = order;
    for (let i = 0; i < 20; i++) {
      if (!cur.revisedFromId) break;
      const parent = all.find(o => o.id === cur.revisedFromId);
      if (!parent) break;
      chain.push(parent.orderNumber ? `#${parent.orderNumber}` : this.shortDate(parent.timestamp));
      cur = parent;
    }
    return chain.join(' → ');
  }

  getDescendantChain(order: Order): string {
    const all = this.ordersService.orders();
    const chain: string[] = [];
    let cur = order;
    for (let i = 0; i < 20; i++) {
      const child = all.find(o => o.revisedFromId === cur.id);
      if (!child) break;
      chain.push(child.orderNumber ? `#${child.orderNumber}` : this.shortDate(child.timestamp));
      cur = child;
    }
    return chain.join(' → ');
  }

  // ── Admin actions ─────────────────────────────────────────────────────────

  private _checkDelivery(order: Order): boolean {
    if (!order.cuLivrare) return true;
    if (!order.client.phone?.trim()) {
      this.snackBar.open('Comanda cu livrare necesită un număr de telefon.', 'OK', { duration: 3500, panelClass: ['snack-warn'] });
      return false;
    }
    if (!order.client.address?.trim()) {
      this.snackBar.open('Comanda cu livrare necesită o adresă de livrare.', 'OK', { duration: 3500, panelClass: ['snack-warn'] });
      return false;
    }
    if (!order.deliveryDate) {
      this.snackBar.open('Comanda cu livrare necesită o dată de livrare.', 'OK', { duration: 3500, panelClass: ['snack-warn'] });
      return false;
    }
    if (!order.deliveryTime) {
      this.snackBar.open('Comanda cu livrare necesită o oră de livrare.', 'OK', { duration: 3500, panelClass: ['snack-warn'] });
      return false;
    }
    return true;
  }

  startEditDelivery(order: Order, e: Event): void {
    e.stopPropagation();
    this.editingDeliveryId.set(order.id);
    this.editDeliveryDate = order.deliveryDate ?? '';
    this.editDeliveryTime = order.deliveryTime ?? '';
  }

  saveDelivery(order: Order, e: Event): void {
    e.stopPropagation();
    if (order.cuLivrare && (!this.editDeliveryDate || !this.editDeliveryTime)) {
      this.snackBar.open('Data și ora livrării sunt obligatorii pentru comenzile cu livrare.', 'OK', { duration: 3500, panelClass: ['snack-warn'] });
      return;
    }
    if (this.editDeliveryDate && this.editDeliveryTime) {
      const dt = new Date(`${this.editDeliveryDate}T${this.editDeliveryTime}`);
      if (dt < new Date()) {
        this.snackBar.open('Data și ora livrării nu pot fi în trecut.', 'OK', { duration: 3500, panelClass: ['snack-warn'] });
        return;
      }
    }
    this.ordersService.updateOrderDeliveryDateTime(order.id, this.editDeliveryDate, this.editDeliveryTime);
    this.editingDeliveryId.set(null);
  }

  cancelEditDelivery(e: Event): void {
    e.stopPropagation();
    this.editingDeliveryId.set(null);
  }

  formatDelivery(date?: string, time?: string): string {
    if (!date && !time) return '';
    const parts: string[] = [];
    if (date) parts.push(new Date(date + 'T00:00').toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit', year: '2-digit' }));
    if (time) parts.push(time);
    return parts.join(' ');
  }

  acceptOrder(order: Order): void {
    if (!this._checkDelivery(order)) return;
    this.ordersService.acceptOrder(order.id);
    this.collapseRow(order.id);
    this.snackBar.open('Comanda acceptată!', 'OK', { duration: 2500, panelClass: ['snack-success'] });
  }

  cancelOrder(order: Order): void {
    this.ordersService.cancelOrder(order.id);
    this.collapseRow(order.id);
    this.snackBar.open('Comanda anulată.', '', { duration: 2500 });
  }

  reopenOrder(order: Order): void {
    this.ordersService.reopenOrder(order.id);
    this.snackBar.open('Comanda redeschisă.', 'OK', { duration: 2500 });
  }

  finalizeOrder(order: Order): void {
    if (!this._checkDelivery(order)) return;
    const newProducts = order.products
      .map((p, i) => ({ ...p, qty: this.getEditQty(order.id, i, p.qty) }))
      .filter(p => p.qty > 0);
    if (newProducts.length === 0) {
      this.snackBar.open('Cel puțin un produs trebuie să rămână.', '', { duration: 2500 });
      return;
    }
    const newOrder: Order = {
      id: generateId(), timestamp: new Date().toISOString(),
      agent: order.agent, client: order.client,
      products: newProducts, status: 'acceptat', revisedFromId: order.id
    };
    const result = this.ordersService.reviseOrder(order.id, newOrder);
    if (!result.ok) {
      const list = result.insufficient.map(i => `• ${i.name}: disponibil ${i.available}, solicitat ${i.requested}`).join('\n');
      this.snackBar.open(`Stoc insuficient:\n${list}`, 'Închide', { duration: 6000, panelClass: ['snack-warn'], verticalPosition: 'top' });
      return;
    }
    this._editQty.update(m => {
      const n = { ...m };
      order.products.forEach((_, i) => delete n[this.ekey(order.id, i)]);
      return n;
    });
    this.collapseRow(order.id);
    this.snackBar.open('Comanda finalizată cu modificări!', 'OK', { duration: 3000, panelClass: ['snack-success'] });
  }

  // ── CSV export ────────────────────────────────────────────────────────────

  exportCsv(): void {
    const headers = ['Nr.', 'Data', 'Agent', 'Client', 'Telefon', 'Produs', 'Cantitate', 'UM', 'Status'];
    const rows: string[][] = [];
    for (const o of this.sortedFiltered()) {
      const status = o.superseded ? 'Înlocuită' : o.status === 'anulat' ? 'Anulată' :
                     o.status === 'acceptat' ? 'Acceptată' : 'În așteptare';
      for (const p of o.products) {
        rows.push([`#${o.orderNumber ?? '?'}`, this.formatDate(o.timestamp),
          o.agent?.name ?? '', o.client.name, o.client.phone ?? '',
          p.name, String(p.qty), p.um, status]);
      }
    }
    this._downloadCsv([headers, ...rows], `comenzi-toate-${new Date().toISOString().slice(0, 10)}.csv`, [4]);
  }

  downloadOrderCsv(order: Order, e: Event): void {
    e.stopPropagation();
    const status = order.superseded ? 'Înlocuită' : order.status === 'anulat' ? 'Anulată' :
                   order.status === 'acceptat' ? 'Acceptată' : 'În așteptare';
    const headers = ['Nr.', 'Data', 'Agent', 'Client', 'Telefon', 'Produs', 'Cantitate', 'UM', 'Status'];
    const rows = order.products.map(p => [
      `#${order.orderNumber ?? '?'}`, this.formatDate(order.timestamp),
      order.agent?.name ?? '', order.client.name, order.client.phone ?? '',
      p.name, String(p.qty), p.um, status
    ]);
    this._downloadCsv([headers, ...rows], `comanda-${order.orderNumber ?? order.id.slice(0, 6)}.csv`, [4]);
  }

  private _downloadCsv(rows: string[][], filename: string, textCols: number[] = []): void {
    const csv = rows.map((r, ri) => r.map((v, ci) => {
      const s = String(v ?? '').replace(/"/g, '""');
      return ri > 0 && textCols.includes(ci) ? `="${s}"` : `"${s}"`;
    }).join(',')).join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  }

  // ── Delivery ──────────────────────────────────────────────────────────────

  toggleDelivery(order: Order, e: Event): void {
    e.stopPropagation();
    this.ordersService.updateOrderDelivery(order.id, !order.cuLivrare);
  }

  startEditAddress(order: Order, e: Event): void {
    e.stopPropagation();
    this.editingAddressId.set(order.id);
    this.editAddressVal = order.client.address ?? '';
  }

  saveDeliveryAddress(order: Order, e: Event): void {
    e.stopPropagation();
    if (order.cuLivrare && !this.editAddressVal.trim()) {
      this.snackBar.open('Adresa de livrare este obligatorie pentru comenzile cu livrare.', 'OK', { duration: 3000, panelClass: ['snack-warn'] });
      return;
    }
    this.ordersService.updateOrderDelivery(order.id, order.cuLivrare ?? false, this.editAddressVal.trim());
    this.editingAddressId.set(null);
  }

  cancelEditAddress(e: Event): void {
    e.stopPropagation();
    this.editingAddressId.set(null);
  }

  startEditPhone(order: Order, e: Event): void {
    e.stopPropagation();
    this.editingPhoneId.set(order.id);
    this.editPhoneVal = order.client.phone ?? '';
  }

  savePhone(order: Order, e: Event): void {
    e.stopPropagation();
    const phone = this.editPhoneVal.trim().replace(/\D/g, '');
    if (order.cuLivrare && !phone) {
      this.snackBar.open('Telefonul este obligatoriu pentru comenzile cu livrare.', 'OK', { duration: 3000, panelClass: ['snack-warn'] });
      return;
    }
    this.ordersService.updateOrderClient(order.id, { phone });
    this.editingPhoneId.set(null);
  }

  cancelEditPhone(e: Event): void {
    e.stopPropagation();
    this.editingPhoneId.set(null);
  }

  // ── Expand / collapse ─────────────────────────────────────────────────────

  toggleExpand(orderId: string): void {
    this.expandedRows.update(m =>
      m[orderId] ? Object.fromEntries(Object.entries(m).filter(([k]) => k !== orderId))
                 : { ...m, [orderId]: true }
    );
  }

  collapseRow(orderId: string): void {
    this.expandedRows.update(m =>
      Object.fromEntries(Object.entries(m).filter(([k]) => k !== orderId))
    );
  }

  ekey(orderId: string, idx: number): string { return `${orderId}::${idx}`; }

  getEditQty(orderId: string, idx: number, def: number): number {
    return this._editQty()[this.ekey(orderId, idx)] ?? def;
  }
  setEditQty(orderId: string, idx: number, def: number, val: number | string): void {
    this._editQty.update(m => ({ ...m, [this.ekey(orderId, idx)]: Math.max(0, parseInt(String(val)) || 0) }));
  }
  incEditQty(orderId: string, idx: number, def: number): void {
    this.setEditQty(orderId, idx, def, this.getEditQty(orderId, idx, def) + 1);
  }
  decEditQty(orderId: string, idx: number, def: number): void {
    this.setEditQty(orderId, idx, def, this.getEditQty(orderId, idx, def) - 1);
  }

  printOrder(order: Order, e: Event): void {
    e.stopPropagation();
    const status = order.superseded ? 'Înlocuită' : order.status === 'anulat' ? 'Anulată' :
                   order.status === 'acceptat' ? 'Acceptată' : 'În așteptare';
    const rows = order.products.map((p, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${p.name}</td>
        <td style="text-align:center">${p.qty}</td>
        <td>${p.um}</td>
        <td>${p.category ?? ''}</td>
        ${p.codExtern ? `<td>${p.codExtern}</td>` : '<td></td>'}
      </tr>`).join('');

    const html = `<!DOCTYPE html><html lang="ro"><head><meta charset="UTF-8">
      <title>Comanda #${order.orderNumber ?? order.id.slice(0,6)}</title>
      <style>
        body { font-family: Arial, sans-serif; font-size: 13px; color: #111; margin: 24px; }
        h2 { margin: 0 0 4px; font-size: 16px; }
        .meta { display: flex; gap: 32px; margin-bottom: 16px; color: #444; font-size: 12px; }
        .meta span { display: flex; flex-direction: column; }
        .meta strong { color: #111; font-size: 13px; }
        table { width: 100%; border-collapse: collapse; margin-top: 8px; }
        th { background: #f0f0f0; text-align: left; padding: 6px 8px; font-size: 12px;
             border: 1px solid #ccc; text-transform: uppercase; letter-spacing: .04em; }
        td { padding: 5px 8px; border: 1px solid #ddd; vertical-align: top; }
        tr:nth-child(even) td { background: #fafafa; }
        .footer { margin-top: 16px; font-size: 11px; color: #888; border-top: 1px solid #ddd; padding-top: 8px; }
        @media print { body { margin: 0; } }
      </style></head><body>
      <h2>Comanda #${order.orderNumber ?? '—'} &nbsp;·&nbsp; ${status}</h2>
      <div class="meta">
        <span><label>Client</label><strong>${order.client.name}</strong></span>
        ${order.client.phone ? `<span><label>Telefon</label><strong>${order.client.phone}</strong></span>` : ''}
        <span><label>Agent</label><strong>${order.agent?.name ?? '—'}</strong></span>
        <span><label>Data</label><strong>${this.formatDate(order.timestamp)}</strong></span>
      </div>
      <table>
        <thead><tr>
          <th>#</th><th>Produs</th><th>Cantitate</th><th>UM</th><th>Categorie</th><th>Cod extern</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="footer">Generat din Depozit App · ${new Date().toLocaleString('ro-RO')}</div>
      <script>window.onload = () => { window.print(); }<\/script>
    </body></html>`;

    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); }
  }

  resendEmail(order: Order, e: Event): void {
    e.stopPropagation();
    const text = this.ordersService.generateText(order);
    window.open(this.ordersService.generateMailto(order, text), '_blank');
  }

  sendWhatsApp(order: Order, phone: string, e: Event): void {
    e.stopPropagation();
    const normalized = this._normalizePhone(phone);
    const text = this.ordersService.generateText(order);
    const url = `https://wa.me/${normalized}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  }

  sendWhatsAppGroup(order: Order, link: string, e: Event): void {
    e.stopPropagation();
    window.open(link, '_blank');
  }

  private _normalizePhone(phone: string): string {
    let p = phone.replace(/[\s\-().]/g, '');
    if (p.startsWith('00')) p = '+' + p.slice(2);
    if (p.startsWith('0') && !p.startsWith('00')) p = '+4' + p;
    if (p.startsWith('40') && !p.startsWith('+')) p = '+' + p;
    return p;
  }
}
