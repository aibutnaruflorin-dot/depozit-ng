import { Component, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { OrdersService, generateId } from '../../core/services/orders.service';
import { Order } from '../../core/models/order.model';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatChipsModule } from '@angular/material/chips';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatCardModule } from '@angular/material/card';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';

@Component({
  selector: 'app-history',
  standalone: true,
  imports: [
    CommonModule, RouterModule,
    MatCardModule, MatButtonModule, MatIconModule, MatChipsModule,
    MatExpansionModule, MatSnackBarModule, MatTooltipModule,
    TableModule, TagModule
  ],
  templateUrl: './history.component.html',
  styleUrl:    './history.component.scss'
})
export class HistoryComponent {
  expandedRows = signal<Record<string, boolean>>({});
  private _editQty = signal<Record<string, number>>({});
  readonly editQtyMap = this._editQty.asReadonly();

  constructor(
    public  auth: AuthService,
    private ordersService: OrdersService,
    private snackBar: MatSnackBar
  ) {}

  readonly myOrders = computed(() => {
    const id = this.auth.session()?.userId;
    return this.ordersService.orders().filter(o => o.agent?.id === id);
  });

  formatDate(iso: string): string {
    return new Date(iso).toLocaleString('ro-RO');
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

    const session = this.auth.session()!;
    const newOrder: Order = {
      id:             generateId(),
      timestamp:      new Date().toISOString(),
      agent:          { id: session.userId, name: session.name, username: session.username },
      client:         order.client,
      products:       newProducts,
      status:         'trimis',
      revisedFromId:  order.id
    };

    this.ordersService.reviseOrder(order.id, newOrder);

    const text = this.ordersService.generateText(newOrder);
    window.open(this.ordersService.generateMailto(newOrder, text), '_blank');

    // Clear edit state for this order
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
