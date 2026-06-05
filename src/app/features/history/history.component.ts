import { Component, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { OrdersService } from '../../core/services/orders.service';
import { Order } from '../../core/models/order.model';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';

@Component({
  selector: 'app-history',
  standalone: true,
  imports: [
    CommonModule, RouterModule,
    MatCardModule, MatButtonModule, MatIconModule, MatChipsModule,
    MatExpansionModule, MatSnackBarModule,
    TableModule, TagModule
  ],
  templateUrl: './history.component.html',
  styleUrl:    './history.component.scss'
})
export class HistoryComponent {
  constructor(
    public auth: AuthService,
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

  resendEmail(order: Order): void {
    const text   = this.ordersService.generateText(order);
    const mailto = this.ordersService.generateMailto(order, text);
    window.open(mailto, '_blank');
  }

  copyOrder(order: Order): void {
    const text = this.ordersService.generateText(order);
    navigator.clipboard.writeText(text).then(() => {
      this.snackBar.open('📋 Comanda copiată!', '', { duration: 2000, panelClass: ['snack-success'] });
    });
  }
}
