import { Component, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { OrdersService } from '../../core/services/orders.service';
import { TransportService } from '../../core/services/transport.service';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Order } from '../../core/models/order.model';
import { MobileNavComponent } from '../../shared/mobile-nav/mobile-nav.component';
import { Router } from '@angular/router';

type StatusTab = 'toate' | 'draft' | 'asteapta' | 'activ' | 'livrat' | 'anulat';

@Component({
  selector: 'app-mobile-history-all',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, MatSnackBarModule, MobileNavComponent],
  templateUrl: './mobile-history-all.component.html',
  styleUrl: './mobile-history-all.component.scss'
})
export class MobileHistoryAllComponent {
  activeTab    = signal<StatusTab>('toate');
  expandedId   = signal<string | null>(null);
  filterAgent  = signal('');
  filterClient = signal('');
  showSearch   = signal(false);

  readonly TABS: { key: StatusTab; label: string }[] = [
    { key: 'toate',   label: 'Toate'    },
    { key: 'draft',   label: 'Ciornă'   },
    { key: 'asteapta',label: 'Trimise'  },
    { key: 'activ',   label: 'Active'   },
    { key: 'livrat',  label: 'Livrat'   },
    { key: 'anulat',  label: 'Anulat'   },
  ];

  constructor(
    public auth: AuthService,
    public ordersService: OrdersService,
    public transportService: TransportService,
    private snackBar: MatSnackBar,
    private router: Router
  ) {}

  readonly allOrders = computed(() =>
    this.ordersService.orders()
      .filter(o => !o.superseded)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  );

  readonly agents = computed(() => {
    const seen = new Set<string>();
    const result: { id: number; name: string }[] = [];
    for (const o of this.allOrders()) {
      if (!seen.has(String(o.agent?.id))) {
        seen.add(String(o.agent?.id));
        result.push({ id: o.agent.id, name: o.agent.name });
      }
    }
    return result;
  });

  readonly filtered = computed(() => {
    const tab    = this.activeTab();
    const agent  = this.filterAgent().trim().toLowerCase();
    const client = this.filterClient().trim().toLowerCase();
    let orders = this.allOrders();
    if (agent)  orders = orders.filter(o => o.agent?.name.toLowerCase().includes(agent));
    if (client) orders = orders.filter(o => o.client.name.toLowerCase().includes(client));
    if (tab === 'draft')    return orders.filter(o => o.status === 'draft');
    if (tab === 'asteapta') return orders.filter(o => o.status === 'trimis');
    if (tab === 'anulat')   return orders.filter(o => o.status === 'anulat');
    if (tab === 'livrat')   return orders.filter(o => o.status === 'livrat');
    if (tab === 'activ')    return orders.filter(o => !['draft','trimis','anulat','livrat'].includes(o.status));
    return orders;
  });

  readonly counts = computed(() => {
    const orders = this.allOrders();
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
    if (o.status === 'draft')  return 'Ciornă';
    if (o.status === 'trimis') return 'Trimis';
    if (o.status === 'anulat') return 'Anulat';
    if (o.status === 'livrat') return 'Livrat';
    return this.transportService.deriveOrderPlanningStatus(o).label;
  }

  statusClass(o: Order): string {
    if (o.status === 'draft')  return 'chip-draft';
    if (o.status === 'trimis') return 'chip-wait';
    if (o.status === 'anulat') return 'chip-cancel';
    if (o.status === 'livrat') return 'chip-done';
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

  toggleExpand(id: string): void { this.expandedId.update(v => v === id ? null : id); }

  cancelOrder(o: Order, e: Event): void {
    e.stopPropagation();
    if (!confirm(`Anulezi comanda #${o.orderNumber ?? '?'} (${o.client.name})?`)) return;
    this.ordersService.cancelOrder(o.id);
    this.snackBar.open('Comanda anulată.', '', { duration: 2500 });
  }
}
