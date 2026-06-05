import { Component, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { OrdersService, generateId } from '../../core/services/orders.service';
import { StorageService } from '../../core/services/storage.service';
import { Order } from '../../core/models/order.model';
import { User } from '../../core/models/user.model';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { DatePickerModule } from 'primeng/datepicker';

@Component({
  selector: 'app-history-all',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, MatSnackBarModule, MatTooltipModule,
    TableModule, TagModule, DatePickerModule
  ],
  templateUrl: './history-all.component.html',
  styleUrl:    './history-all.component.scss'
})
export class HistoryAllComponent {
  filterAgent  = '';
  filterClient = '';
  filterDateFrom: Date | null = null;
  filterDateTo:   Date | null = null;

  expandedRows = signal<Record<string, boolean>>({});
  private _editQty = signal<Record<string, number>>({});
  readonly editQtyMap = this._editQty.asReadonly();

  readonly agents = computed(() => {
    const users = this.storage.get<User[]>('app_users') || [];
    return users.map(u => ({ id: String(u.id), name: u.name }));
  });

  readonly filtered = computed(() => {
    let orders = this.ordersService.orders();
    if (this.filterAgent)  orders = orders.filter(o => String(o.agent?.id) === this.filterAgent);
    if (this.filterClient) orders = orders.filter(o => o.client?.name?.toLowerCase().includes(this.filterClient.toLowerCase()));
    if (this.filterDateFrom) {
      const from = this.filterDateFrom.toISOString();
      orders = orders.filter(o => o.timestamp >= from);
    }
    if (this.filterDateTo) {
      const to = new Date(this.filterDateTo); to.setHours(23,59,59);
      orders = orders.filter(o => o.timestamp <= to.toISOString());
    }
    return orders;
  });

  constructor(
    private auth: AuthService,
    private ordersService: OrdersService,
    private storage: StorageService,
    private snackBar: MatSnackBar
  ) {}

  reset(): void {
    this.filterAgent = ''; this.filterClient = '';
    this.filterDateFrom = null; this.filterDateTo = null;
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleString('ro-RO');
  }

  shortDate(iso: string): string {
    return new Date(iso).toLocaleString('ro-RO', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
  }

  getOriginalDate(order: Order): string | null {
    if (!order.revisedFromId) return null;
    const orig = this.ordersService.orders().find(o => o.id === order.revisedFromId);
    return orig ? this.shortDate(orig.timestamp) : order.revisedFromId.slice(0, 8);
  }

  getReplacementDate(order: Order): string | null {
    const rep = this.ordersService.orders().find(o => o.revisedFromId === order.id);
    return rep ? this.shortDate(rep.timestamp) : null;
  }

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

  reviseOrder(order: Order): void {
    const newProducts = order.products
      .map((p, i) => ({ ...p, qty: this.getEditQty(order.id, i, p.qty) }))
      .filter(p => p.qty > 0);

    if (newProducts.length === 0) {
      this.snackBar.open('Adaugă cel puțin un produs cu qty > 0.', '', { duration: 2500 });
      return;
    }

    const newOrder: Order = {
      id:            generateId(),
      timestamp:     new Date().toISOString(),
      agent:         order.agent,
      client:        order.client,
      products:      newProducts,
      status:        'trimis',
      revisedFromId: order.id
    };

    this.ordersService.reviseOrder(order.id, newOrder);

    const text = this.ordersService.generateText(newOrder);
    window.open(this.ordersService.generateMailto(newOrder, text), '_blank');

    this._editQty.update(m => {
      const n = { ...m };
      order.products.forEach((_, i) => delete n[this.ekey(order.id, i)]);
      return n;
    });
    this.collapseRow(order.id);

    this.snackBar.open('Comanda revizuită a fost trimisă!', 'OK', { duration: 3000, panelClass: ['snack-success'] });
  }

  resendEmail(order: Order, e: Event): void {
    e.stopPropagation();
    const text = this.ordersService.generateText(order);
    window.open(this.ordersService.generateMailto(order, text), '_blank');
  }

  copyOrder(order: Order, e: Event): void {
    e.stopPropagation();
    const text = this.ordersService.generateText(order);
    navigator.clipboard.writeText(text).then(() => {
      this.snackBar.open('Comanda copiată!', '', { duration: 2000, panelClass: ['snack-success'] });
    });
  }
}
