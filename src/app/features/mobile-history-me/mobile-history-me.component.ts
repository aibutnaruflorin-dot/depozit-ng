import { Component, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { OrdersService } from '../../core/services/orders.service';
import { TransportService } from '../../core/services/transport.service';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Order } from '../../core/models/order.model';
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
  activeTab  = signal<StatusTab>('toate');
  expandedId = signal<string | null>(null);

  readonly TABS: { key: StatusTab; label: string }[] = [
    { key: 'toate',   label: 'Toate'      },
    { key: 'draft',   label: 'Ciornă'     },
    { key: 'asteapta',label: 'Trimise'    },
    { key: 'activ',   label: 'Active'     },
    { key: 'livrat',  label: 'Livrat'     },
    { key: 'anulat',  label: 'Anulat'     },
  ];

  constructor(
    public auth: AuthService,
    public ordersService: OrdersService,
    public transportService: TransportService,
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

  statusLabel(o: Order): string {
    if (o.status === 'draft')   return 'Ciornă';
    if (o.status === 'trimis')  return 'Trimis';
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

  shortDate(iso: string): string {
    return new Date(iso).toLocaleString('ro-RO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  toggleExpand(id: string): void {
    this.expandedId.update(v => v === id ? null : id);
  }

  canSend(o: Order): boolean { return o.status === 'draft'; }
  canCancel(o: Order): boolean { return ['draft','trimis','acceptat'].includes(o.status); }

  sendDraft(o: Order, e: Event): void {
    e.stopPropagation();
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
  }

  cancelOrder(o: Order, e: Event): void {
    e.stopPropagation();
    if (!confirm(`Anulezi comanda #${o.orderNumber ?? '?'} pentru ${o.client.name}?`)) return;
    this.ordersService.cancelOrder(o.id);
    this.snackBar.open('Comanda anulată.', '', { duration: 2500 });
  }

  newOrder(): void { this.router.navigate(['/app/m-new-order']); }
}
