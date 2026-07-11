import { Component, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { OrdersService, generateId } from '../../core/services/orders.service';
import { TransportService } from '../../core/services/transport.service';
import { CatalogsService } from '../../core/services/catalogs.service';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Order, OrderProduct } from '../../core/models/order.model';
import { StorageService } from '../../core/services/storage.service';
import { WhatsAppContact } from '../../core/models/whatsapp.model';
import { MobileNavComponent } from '../../shared/mobile-nav/mobile-nav.component';

type StatusTab = 'toate' | 'asteapta' | 'activ' | 'livrat' | 'anulat';

@Component({
  selector: 'app-mobile-history-all',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatSnackBarModule, MobileNavComponent],
  templateUrl: './mobile-history-all.component.html',
  styleUrl: './mobile-history-all.component.scss'
})
export class MobileHistoryAllComponent {
  activeTab    = signal<StatusTab>('toate');
  detailId     = signal<string | null>(null);
  _editQty     = signal<Record<string, number>>({});
  _obsExpanded = signal<Set<string>>(new Set());

  filterAgent  = signal('');
  filterClient = signal('');
  filterNr     = signal('');
  showSearch   = signal(false);

  isObsExpanded(orderId: string): boolean { return this._obsExpanded().has(orderId); }
  toggleObs(orderId: string): void {
    this._obsExpanded.update(s => {
      const n = new Set(s);
      n.has(orderId) ? n.delete(orderId) : n.add(orderId);
      return n;
    });
  }

  readonly TABS: { key: StatusTab; label: string }[] = [
    { key: 'toate',    label: 'Toate'   },
    { key: 'asteapta', label: 'Trimise' },
    { key: 'activ',    label: 'Active'  },
    { key: 'livrat',   label: 'Livrat'  },
    { key: 'anulat',   label: 'Anulat'  },
  ];

  readonly whatsappContacts = computed<WhatsAppContact[]>(() =>
    this.storage.get<WhatsAppContact[]>('app_whatsapp_contacts') ?? []
  );

  constructor(
    public auth: AuthService,
    public ordersService: OrdersService,
    public transportService: TransportService,
    public catalogsService: CatalogsService,
    private storage: StorageService,
    private snackBar: MatSnackBar,
    private router: Router
  ) {}

  readonly allOrders = computed(() =>
    this.ordersService.orders()
      .filter(o => !o.superseded && o.status !== 'draft')
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  );

  readonly filtered = computed(() => {
    const tab    = this.activeTab();
    const agent  = this.filterAgent().trim().toLowerCase();
    const client = this.filterClient().trim().toLowerCase();
    const nr     = this.filterNr().trim().replace('#', '');
    let orders   = this.allOrders();

    if (agent)  orders = orders.filter(o => o.agent?.name.toLowerCase().includes(agent));
    if (client) orders = orders.filter(o => o.client.name.toLowerCase().includes(client));
    if (nr)     orders = orders.filter(o => String(o.orderNumber ?? '').includes(nr));

    if (tab === 'asteapta') return orders.filter(o => o.status === 'trimis');
    if (tab === 'anulat')   return orders.filter(o => o.status === 'anulat');
    if (tab === 'livrat')   return orders.filter(o => o.status === 'livrat');
    if (tab === 'activ')    return orders.filter(o => !['trimis', 'anulat', 'livrat'].includes(o.status));
    return orders;
  });

  readonly counts = computed(() => {
    const orders = this.allOrders();
    return {
      toate:    orders.length,
      asteapta: orders.filter(o => o.status === 'trimis').length,
      activ:    orders.filter(o => !['trimis', 'anulat', 'livrat'].includes(o.status)).length,
      livrat:   orders.filter(o => o.status === 'livrat').length,
      anulat:   orders.filter(o => o.status === 'anulat').length,
    };
  });

  readonly currentDetailOrder = computed(() => {
    const id = this.detailId();
    if (!id) return null;
    return this.ordersService.orders().find(o => o.id === id) ?? null;
  });

  isKeyUser(): boolean { return this.auth.isKeyUser(); }
  isOwner(o: Order): boolean { return o.agent?.id === this.auth.session()?.userId; }

  isActiveOrder(o: Order): boolean {
    return ['trimis','acceptat','planificat','in_livrare','livrat_partial'].includes(o.status) && !o.superseded;
  }

  hasQtyChanges(o: Order): boolean {
    return this.hasEditedQty(o) || !!(o.pendingProducts?.length);
  }

  toggleLock(o: Order): void {
    this.ordersService.setOrderLocked(o.id, !o.locked);
    const msg = o.locked
      ? 'Comanda deblocată — agentul poate modifica din nou.'
      : 'Comanda blocată — agentul nu mai poate face modificări.';
    this.snackBar.open(msg, 'OK', { duration: 3000 });
  }

  statusLabel(o: Order): string {
    if (o.status === 'trimis')  return 'În aşteptare';
    if (o.status === 'anulat')  return 'Anulat';
    if (o.status === 'livrat')  return 'Livrat';
    return this.transportService.deriveOrderPlanningStatus(o).label;
  }

  statusClass(o: Order): string {
    if (o.status === 'trimis')  return 'chip-wait';
    if (o.status === 'anulat')  return 'chip-cancel';
    if (o.status === 'livrat')  return 'chip-done';
    const s = this.transportService.deriveOrderPlanningStatus(o);
    if (s.key === 'neplanificat') return 'chip-warn';
    if (s.key === 'livrat')       return 'chip-done';
    return 'chip-active';
  }

  orderTotal(o: Order): number {
    return o.products.reduce((s, p) => s + (p.pretCuTVA ?? 0) * p.qty, 0);
  }

  orderTotalFaraTVA(o: Order): number {
    return o.products.reduce((s, p) => s + (p.pretFaraTVA ?? 0) * p.qty, 0);
  }

  orderMasa(o: Order): number {
    return o.products.reduce((s, p) => s + (p.masaNeta ?? 0) * p.qty, 0);
  }

  shortDate(iso: string): string {
    return new Date(iso).toLocaleString('ro-RO', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
    });
  }

  getStockInfo(p: OrderProduct): { importedQty: number; consumedQty: number; bufferQty: number; finalQty: number } | null {
    if (!p.catalogId) return null;
    const s = this.catalogsService.getStockThreeCol(p.catalogId, p.nr);
    return s ? { importedQty: s.importedQty, consumedQty: s.consumedQty, bufferQty: s.bufferQty, finalQty: s.finalQty } : null;
  }

  getBlockingOrders(p: OrderProduct, currentOrderId: string): { orderNumber?: number; clientName: string; qty: number; statusLabel: string }[] {
    if (!p.catalogId) return [];
    const statusMap: Record<string, string> = {
      draft: 'Ciornă', trimis: 'În așteptare', acceptat: 'Acceptat',
      planificat: 'Planificat', in_livrare: 'În livrare', livrat: 'Livrat'
    };
    return this.ordersService.getBlockingOrders(p.catalogId, p.nr)
      .filter(b => b.orderNumber !== undefined || b.clientName !== '')
      .filter((_, i, arr) => i === arr.findIndex(x => x.orderNumber === arr[i].orderNumber))
      .map(b => ({ ...b, statusLabel: statusMap[b.status] ?? b.status }));
  }

  stockDotClass(qty: number): string {
    if (qty <= 0) return 'dot-zero';
    if (qty <= 5) return 'dot-low';
    return 'dot-ok';
  }

  openDetail(o: Order): void { this.detailId.set(o.id); }
  closeDetail(): void { this.detailId.set(null); }

  canAccept(o: Order): boolean {
    return o.status === 'trimis' && !o.superseded && this.isKeyUser() && !this.hasQtyChanges(o);
  }

  canFinalizeWithChanges(o: Order): boolean {
    return this.isActiveOrder(o) && this.isKeyUser() && this.hasQtyChanges(o);
  }

  canAddProducts(o: Order): boolean {
    return !o.locked
      && ['trimis', 'acceptat', 'planificat', 'livrat_partial'].includes(o.status)
      && !o.superseded
      && (this.isKeyUser() || this.isOwner(o));
  }

  canCancel(o: Order): boolean {
    return ['trimis', 'acceptat', 'planificat'].includes(o.status)
      && !o.superseded
      && (this.isKeyUser() || this.isOwner(o));
  }

  canReopen(o: Order): boolean {
    return o.status === 'anulat' && (this.isKeyUser() || this.isOwner(o));
  }

  ekey(orderId: string, idx: number): string { return `${orderId}:${idx}`; }

  getEditQty(orderId: string, idx: number, defaultQty: number): number {
    return this._editQty()[this.ekey(orderId, idx)] ?? defaultQty;
  }

  setEditQty(orderId: string, idx: number, qty: number): void {
    if (qty < 0) return;
    this._editQty.update(m => ({ ...m, [this.ekey(orderId, idx)]: qty }));
  }

  maxEditableQty(order: Order, p: OrderProduct): number {
    if (!p.catalogId) return Infinity;
    const stock = this.catalogsService.getStock(p.catalogId, p.nr);
    if (stock === null) return Infinity;
    // order is 'trimis' — stock is already consumed, so available = stock + p.qty
    return stock + p.qty;
  }

  editQtyExceedsStock(orderId: string, idx: number, p: OrderProduct): boolean {
    if (!p.catalogId) return false;
    const edited = this._editQty()[this.ekey(orderId, idx)];
    if (edited === undefined) return false;
    const stock = this.catalogsService.getStock(p.catalogId, p.nr);
    return stock !== null && edited > stock;
  }

  incEditQty(orderId: string, idx: number, currentQty: number, maxQty = Infinity): void {
    const current = this.getEditQty(orderId, idx, currentQty);
    if (current >= maxQty) {
      this.snackBar.open('Stoc insuficient — nu mai există cantitate disponibilă pentru acest produs.', 'OK', { duration: 3000, panelClass: ['snack-error'] });
      return;
    }
    this.setEditQty(orderId, idx, current + 1);
  }

  decEditQty(orderId: string, idx: number, currentQty: number): void {
    this.setEditQty(orderId, idx, Math.max(0, this.getEditQty(orderId, idx, currentQty) - 1));
  }

  hasEditedQty(order: Order): boolean {
    return order.products.some((_, i) => this._editQty()[this.ekey(order.id, i)] !== undefined);
  }

  incPendingQty(orderId: string, idx: number): void {
    const order = this.ordersService.orders().find(o => o.id === orderId);
    const p = order?.pendingProducts?.[idx];
    if (!p) return;
    if (p.catalogId) {
      const stock = this.catalogsService.getStock(p.catalogId, p.nr);
      if (stock !== null && p.qty >= stock) {
        this.snackBar.open('Stoc insuficient — nu mai există cantitate disponibilă.', 'OK', { duration: 3000, panelClass: ['snack-error'] });
        return;
      }
    }
    this.ordersService.updatePendingProduct(orderId, idx, p.qty + 1);
  }

  decPendingQty(orderId: string, idx: number): void {
    const order = this.ordersService.orders().find(o => o.id === orderId);
    const p = order?.pendingProducts?.[idx];
    if (!p) return;
    const newQty = p.qty - 1;
    if (newQty <= 0) {
      if (!confirm(`Elimini "${p.name}" din produsele neconfirmate?`)) return;
      this.ordersService.removePendingProduct(orderId, idx);
    } else {
      this.ordersService.updatePendingProduct(orderId, idx, newQty);
    }
  }

  deletePending(orderId: string, idx: number, name: string): void {
    if (!confirm(`Elimini "${name}" din produsele neconfirmate?`)) return;
    this.ordersService.removePendingProduct(orderId, idx);
  }

  acceptOrder(o: Order): void {
    this.ordersService.acceptOrder(o.id);
    this.snackBar.open(`Comanda #${o.orderNumber ?? '?'} acceptată!`, 'OK', { duration: 2500, panelClass: ['snack-success'] });
    // keep sheet open — currentDetailOrder() will reactively show new status
  }

  finalizeOrder(o: Order): void {
    const withEditedQty = o.products.map((p, i) => ({ ...p, qty: this.getEditQty(o.id, i, p.qty) }));

    // Pre-check stock
    const overStock = withEditedQty.filter(p => {
      if (!p.catalogId) return false;
      const max = this.maxEditableQty(o, p);
      return p.qty > max;
    });
    if (overStock.length > 0) {
      const list = overStock.map(p => {
        const max = this.maxEditableQty(o, p);
        return `• ${p.name}: disponibil ${max}, solicitat ${p.qty}`;
      }).join('\n');
      this.snackBar.open(`Stoc insuficient:\n${list}`, 'Închide', { duration: 6000, panelClass: ['snack-error'], verticalPosition: 'top' });
      return;
    }

    const newProducts = [...withEditedQty.filter(p => p.qty > 0), ...(o.pendingProducts ?? []).filter(p => p.qty > 0)];
    if (newProducts.length === 0) {
      this.snackBar.open('Cel puțin un produs trebuie să rămână.', '', { duration: 2500 });
      return;
    }

    const newOrder: Order = {
      id:            generateId(),
      timestamp:     new Date().toISOString(),
      agent:         o.agent,
      client:        o.client,
      cuLivrare:     o.cuLivrare,
      deliveryDate:  o.deliveryDate,
      deliveryTime:  o.deliveryTime,
      products:      newProducts,
      status:        'acceptat',
      revisedFromId: o.id
    };

    const result = this.ordersService.reviseOrder(o.id, newOrder);
    if (!result.ok) {
      const list = result.insufficient.map(i => `• ${i.name}: disponibil ${i.available}, solicitat ${i.requested}`).join('\n');
      this.snackBar.open(`Stoc insuficient:\n${list}`, 'Închide', { duration: 6000, panelClass: ['snack-warn'], verticalPosition: 'top' });
      return;
    }

    this._editQty.update(m => {
      const n = { ...m };
      o.products.forEach((_, i) => delete n[this.ekey(o.id, i)]);
      return n;
    });

    this.closeDetail();
    this.snackBar.open('Comanda finalizată cu modificări!', 'OK', { duration: 3000, panelClass: ['snack-success'] });
  }

  cancelOrder(o: Order): void {
    if (!confirm(`Anulezi comanda #${o.orderNumber ?? '?'} pentru ${o.client.name}?`)) return;
    this.ordersService.cancelOrder(o.id);
    this.snackBar.open('Comanda anulată.', '', { duration: 2500 });
    this.closeDetail();
  }

  reopenOrder(o: Order): void {
    this.ordersService.reopenOrder(o.id);
    this.snackBar.open('Comanda redeschisă.', '', { duration: 2500 });
    // keep sheet open — currentDetailOrder() will reactively show new status
  }

  addProducts(o: Order): void {
    this.closeDetail();
    this.router.navigate(['/app/m-new-order'], {
      state: { addToOrderId: o.id, addPending: true }
    });
  }

  /* ── Quick actions (card level) ─────── */

  emailOrder(o: Order, e: Event): void {
    e.stopPropagation();
    const text = this.ordersService.generateText(o);
    window.open(this.ordersService.generateMailto(o, text), '_blank');
  }

  whatsAppOrder(o: Order, e: Event): void {
    e.stopPropagation();
    const text = this.ordersService.generateText(o);
    const clientPhone = o.client?.phone;
    const contacts = this.whatsappContacts();

    if (clientPhone) {
      let p = clientPhone.replace(/[\s\-().]/g, '');
      if (p.startsWith('00')) p = '+' + p.slice(2);
      else if (p.startsWith('0')) p = '+4' + p;
      else if (p.startsWith('40') && !p.startsWith('+')) p = '+' + p;
      window.open(`https://wa.me/${p}?text=${encodeURIComponent(text)}`, '_blank');
    } else if (contacts.length > 0) {
      const first = contacts[0];
      const url = first.type === 'group'
        ? first.phone
        : `https://wa.me/${first.phone}?text=${encodeURIComponent(text)}`;
      window.open(url, '_blank');
    } else {
      this.snackBar.open('Clientul nu are telefon configurat.', '', { duration: 2500 });
    }
  }

  printOrder(o: Order, e: Event): void {
    e.stopPropagation();
    const status = o.superseded ? 'Înlocuită' : o.status === 'anulat' ? 'Anulată' :
                   o.status === 'acceptat' ? 'Acceptată' : 'În așteptare';
    const rows = o.products.map((p, i) => `
      <tr>
        <td>${i + 1}</td><td>${p.name}</td>
        <td style="text-align:center">${p.qty}</td><td>${p.um}</td>
        <td>${p.category ?? ''}</td><td>${p.codExtern ?? ''}</td>
      </tr>`).join('');
    const html = `<!DOCTYPE html><html lang="ro"><head><meta charset="UTF-8">
      <title>Comanda #${o.orderNumber ?? o.id.slice(0, 6)}</title>
      <style>
        body{font-family:Arial,sans-serif;font-size:13px;color:#111;margin:24px}
        h2{margin:0 0 4px;font-size:16px}
        .meta{display:flex;gap:32px;margin-bottom:16px;color:#444;font-size:12px}
        .meta span{display:flex;flex-direction:column}
        .meta strong{color:#111;font-size:13px}
        table{width:100%;border-collapse:collapse;margin-top:8px}
        th{background:#f0f0f0;text-align:left;padding:6px 8px;font-size:12px;border:1px solid #ccc;text-transform:uppercase;letter-spacing:.04em}
        td{padding:5px 8px;border:1px solid #ddd;vertical-align:top}
        tr:nth-child(even) td{background:#fafafa}
        .footer{margin-top:16px;font-size:11px;color:#888;border-top:1px solid #ddd;padding-top:8px}
        @media print{body{margin:0}}
      </style></head><body>
      <h2>Comanda #${o.orderNumber ?? '—'} · ${status}</h2>
      <div class="meta">
        <span><label>Client</label><strong>${o.client.name}</strong></span>
        ${o.client.phone ? `<span><label>Telefon</label><strong>${o.client.phone}</strong></span>` : ''}
        <span><label>Agent</label><strong>${o.agent?.name ?? '—'}</strong></span>
        <span><label>Data</label><strong>${new Date(o.timestamp).toLocaleString('ro-RO')}</strong></span>
      </div>
      <table><thead><tr>
        <th>#</th><th>Produs</th><th>Cant.</th><th>UM</th><th>Categorie</th><th>Cod extern</th>
      </tr></thead><tbody>${rows}</tbody></table>
      <div class="footer">Generat din Depozit App · ${new Date().toLocaleString('ro-RO')}</div>
      <script>window.onload=()=>{window.print()}<\/script>
    </body></html>`;
    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); }
  }

  downloadOrder(o: Order, e: Event): void {
    e.stopPropagation();
    const header = 'Nr,Produs,Cantitate,UM,Categorie,Cod extern,Furnizor,Fara TVA,Cu TVA';
    const rows = o.products.map((p, i) =>
      [i + 1, `"${p.name}"`, p.qty, p.um, p.category ?? '', p.codExtern ?? '', p.furnizor ?? '',
       p.pretFaraTVA ?? '', p.pretCuTVA ?? ''].join(',')
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `comanda_${o.orderNumber ?? o.id.slice(0, 6)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }
}
