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
import { MobileNavComponent } from '../../shared/mobile-nav/mobile-nav.component';

type StatusTab = 'toate' | 'draft' | 'asteapta' | 'activ' | 'livrat' | 'anulat';

@Component({
  selector: 'app-mobile-history-me',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatSnackBarModule, MobileNavComponent],
  templateUrl: './mobile-history-me.component.html',
  styleUrl: './mobile-history-me.component.scss'
})
export class MobileHistoryMeComponent {
  activeTab = signal<StatusTab>('toate');
  detailId  = signal<string | null>(null);
  _editQty  = signal<Record<string, number>>({});

  readonly TABS: { key: StatusTab; label: string }[] = [
    { key: 'toate',    label: 'Toate'   },
    { key: 'draft',    label: 'Ciornă'  },
    { key: 'asteapta', label: 'Trimise' },
    { key: 'activ',    label: 'Active'  },
    { key: 'livrat',   label: 'Livrat'  },
    { key: 'anulat',   label: 'Anulat'  },
  ];

  constructor(
    public auth: AuthService,
    public ordersService: OrdersService,
    public transportService: TransportService,
    public catalogsService: CatalogsService,
    private snackBar: MatSnackBar,
    private router: Router
  ) {}

  readonly myOrders = computed(() => {
    const id = this.auth.session()?.userId;
    return this.ordersService.orders()
      .filter(o => !o.superseded && o.agent?.id === id)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  });

  readonly filtered = computed(() => {
    const tab = this.activeTab();
    const orders = this.myOrders();
    if (tab === 'toate')    return orders;
    if (tab === 'draft')    return orders.filter(o => o.status === 'draft');
    if (tab === 'asteapta') return orders.filter(o => o.status === 'trimis');
    if (tab === 'anulat')   return orders.filter(o => o.status === 'anulat');
    if (tab === 'livrat')   return orders.filter(o => o.status === 'livrat');
    return orders.filter(o => !['draft','trimis','anulat','livrat'].includes(o.status));
  });

  readonly counts = computed(() => {
    const orders = this.myOrders();
    return {
      toate:    orders.length,
      draft:    orders.filter(o => o.status === 'draft').length,
      asteapta: orders.filter(o => o.status === 'trimis').length,
      activ:    orders.filter(o => !['draft','trimis','anulat','livrat'].includes(o.status)).length,
      livrat:   orders.filter(o => o.status === 'livrat').length,
      anulat:   orders.filter(o => o.status === 'anulat').length,
    };
  });

  readonly currentDetailOrder = computed(() => {
    const id = this.detailId();
    if (!id) return null;
    return this.ordersService.orders().find(o => o.id === id) ?? null;
  });

  statusLabel(o: Order): string {
    if (o.status === 'draft')   return 'Ciornă';
    if (o.status === 'trimis')  return 'În aşteptare';
    if (o.status === 'anulat')  return 'Anulat';
    if (o.status === 'livrat')  return 'Livrat';
    return this.transportService.deriveOrderPlanningStatus(o).label;
  }

  statusClass(o: Order): string {
    if (o.status === 'draft')   return 'chip-draft';
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

  stockDotClass(qty: number): string {
    if (qty <= 0) return 'dot-zero';
    if (qty <= 5) return 'dot-low';
    return 'dot-ok';
  }

  openDetail(o: Order): void { this.detailId.set(o.id); }
  closeDetail(): void { this.detailId.set(null); }

  canSend(o: Order): boolean        { return o.status === 'draft'; }
  canRevise(o: Order): boolean      { return o.status === 'trimis' && !o.superseded && (this.hasEditedQty(o) || !!(o.pendingProducts?.length)); }
  canAddProducts(o: Order): boolean { return ['draft','trimis','acceptat'].includes(o.status); }
  canCancel(o: Order): boolean      { return ['draft','trimis','acceptat'].includes(o.status); }
  canReopen(o: Order): boolean      { return o.status === 'anulat'; }

  ekey(orderId: string, idx: number): string { return `${orderId}:${idx}`; }

  getEditQty(orderId: string, idx: number, defaultQty: number): number {
    return this._editQty()[this.ekey(orderId, idx)] ?? defaultQty;
  }

  setEditQty(orderId: string, idx: number, qty: number): void {
    if (qty < 0) return;
    this._editQty.update(m => ({ ...m, [this.ekey(orderId, idx)]: qty }));
  }

  incEditQty(orderId: string, idx: number, currentQty: number): void {
    this.setEditQty(orderId, idx, this.getEditQty(orderId, idx, currentQty) + 1);
  }

  decEditQty(orderId: string, idx: number, currentQty: number): void {
    this.setEditQty(orderId, idx, Math.max(0, this.getEditQty(orderId, idx, currentQty) - 1));
  }

  hasEditedQty(order: Order): boolean {
    return order.products.some((_, i) => this._editQty()[this.ekey(order.id, i)] !== undefined);
  }

  sendDraft(o: Order): void {
    if (this.hasEditedQty(o)) {
      const editedProducts = o.products
        .map((p, i) => ({ ...p, qty: this.getEditQty(o.id, i, p.qty) }))
        .filter(p => p.qty > 0);
      if (editedProducts.length === 0) {
        this.snackBar.open('Adaugă cel puțin un produs cu cantitate > 0.', '', { duration: 2500 });
        return;
      }
      this.ordersService.updateDraftProducts(o.id, editedProducts);
      this._editQty.update(m => {
        const n = { ...m };
        o.products.forEach((_, i) => delete n[this.ekey(o.id, i)]);
        return n;
      });
    }
    const result = this.ordersService.submitDraftOrder(o.id);
    if (!result.ok) {
      const list = result.insufficient.map(i => `${i.name}: ${i.available}/${i.requested}`).join(', ');
      this.snackBar.open(`Stoc insuficient: ${list}`, 'Închide', { duration: 5000, panelClass: ['snack-warn'] });
      return;
    }
    const sent = this.ordersService.orders().find(x => x.id === o.id)!;
    const text = this.ordersService.generateText(sent);
    window.open(this.ordersService.generateMailto(sent, text), '_blank');
    this.snackBar.open(`Comanda #${sent.orderNumber} trimisă!`, 'OK', { duration: 3000, panelClass: ['snack-success'] });
    this.closeDetail();
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

  reviseOrder(o: Order): void {
    const editedProducts = o.products
      .map((p, i) => ({ ...p, qty: this.getEditQty(o.id, i, p.qty) }))
      .filter(p => p.qty > 0);
    const newProducts = [...editedProducts, ...(o.pendingProducts ?? [])];

    if (newProducts.length === 0) {
      this.snackBar.open('Adaugă cel puțin un produs cu qty > 0.', '', { duration: 2500 });
      return;
    }

    const session = this.auth.session()!;
    const newOrder: Order = {
      id:            generateId(),
      timestamp:     new Date().toISOString(),
      agent:         { id: session.userId, name: session.name, username: session.username },
      client:        o.client,
      cuLivrare:     o.cuLivrare,
      deliveryDate:  o.deliveryDate,
      deliveryTime:  o.deliveryTime,
      products:      newProducts.map((p, i) => ({ ...p, nr: i + 1 })),
      status:        'trimis',
      revisedFromId: o.id
    };

    const result = this.ordersService.reviseOrder(o.id, newOrder);
    if (!result.ok) {
      const list = result.insufficient.map(i => `${i.name}: disponibil ${i.available}, solicitat ${i.requested}`).join(', ');
      this.snackBar.open(`Stoc insuficient: ${list}`, 'Închide', { duration: 5000, panelClass: ['snack-warn'] });
      return;
    }

    const text = this.ordersService.generateText(newOrder);
    window.open(this.ordersService.generateMailto(newOrder, text), '_blank');

    this._editQty.update(m => {
      const n = { ...m };
      o.products.forEach((_, i) => delete n[this.ekey(o.id, i)]);
      return n;
    });

    this.closeDetail();
    this.snackBar.open('Comanda revizuită a fost trimisă!', 'OK', { duration: 3000, panelClass: ['snack-success'] });
  }

  addProducts(o: Order): void {
    this.closeDetail();
    this.router.navigate(['/app/m-new-order'], {
      state: { addToOrderId: o.id, addPending: o.status !== 'draft' }
    });
  }

  newOrder(): void { this.router.navigate(['/app/m-new-order']); }
}
