import { Component, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { OrdersService } from '../../core/services/orders.service';
import { StorageService } from '../../core/services/storage.service';
import { Order } from '../../core/models/order.model';
import { User } from '../../core/models/user.model';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { DatePickerModule } from 'primeng/datepicker';

@Component({
  selector: 'app-history-all',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, MatSnackBarModule,
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

  resendEmail(order: Order): void {
    const text   = this.ordersService.generateText(order);
    const mailto = this.ordersService.generateMailto(order, text);
    window.open(mailto, '_blank');
  }

  copyOrder(order: Order): void {
    const text = this.ordersService.generateText(order);
    navigator.clipboard.writeText(text).then(() => {
      this.snackBar.open('📋 Copiat!', '', { duration: 2000, panelClass: ['snack-success'] });
    });
  }
}
