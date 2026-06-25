import { Component, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TransportService } from '../../core/services/transport.service';
import { OrdersService } from '../../core/services/orders.service';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Transport } from '../../core/models/transport.model';
import { Order } from '../../core/models/order.model';
import { MobileNavComponent } from '../../shared/mobile-nav/mobile-nav.component';

type TabKey = 'active' | 'planned' | 'done';

@Component({
  selector: 'app-mobile-transport',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatSnackBarModule, MobileNavComponent],
  templateUrl: './mobile-transport.component.html',
  styleUrl: './mobile-transport.component.scss'
})
export class MobileTransportComponent {
  activeTab  = signal<TabKey>('active');
  expandedId = signal<string | null>(null);

  constructor(
    public transportService: TransportService,
    public ordersService: OrdersService,
    private snackBar: MatSnackBar
  ) {}

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

  readonly displayList = computed(() =>
    this.activeTab() === 'done' ? this.done() : this.active()
  );

  ordersForTransport(t: Transport): Order[] {
    return [...new Set(t.deliveries.map(d => d.orderId))]
      .map(id => this.ordersService.orders().find(o => o.id === id))
      .filter((o): o is Order => !!o);
  }

  vehicleName(t: Transport): string {
    const v = this.transportService.getVehicle(t.vehicleId);
    return v?.alias || v?.numarInmatriculare || t.vehicleId;
  }
  driverName(t: Transport): string {
    return this.transportService.getDriver(t.driverId)?.nume ?? t.driverId;
  }

  statusLabel(t: Transport): string {
    const m: Record<string, string> = {
      planificat: 'Planificat', confirmat_sofer: 'Confirmat', in_livrare: 'În livrare',
      livrat: 'Livrat', anulat: 'Anulat', sters: 'Șters'
    };
    return m[t.status] ?? t.status;
  }

  statusClass(t: Transport): string {
    if (t.status === 'in_livrare')    return 'chip-active';
    if (t.status === 'confirmat_sofer') return 'chip-confirm';
    if (t.status === 'planificat')    return 'chip-plan';
    if (t.status === 'livrat')        return 'chip-done';
    return 'chip-cancel';
  }

  toggleExpand(id: string): void { this.expandedId.update(v => v === id ? null : id); }
}
