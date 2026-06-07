import { Component, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../core/services/auth.service';
import { TransportService } from '../../core/services/transport.service';
import { OrdersService } from '../../core/services/orders.service';
import { Transport, TransportStatus } from '../../core/models/transport.model';
import { Order } from '../../core/models/order.model';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';

@Component({
  selector: 'app-my-trips',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatButtonModule, MatSnackBarModule, MatTooltipModule],
  templateUrl: './my-trips.component.html',
  styleUrl: './my-trips.component.scss'
})
export class MyTripsComponent {
  showHistoric    = signal(false);
  showHistoricMap = signal<Record<string, boolean>>({});

  /** ID-ul userului curent ca string, pentru a putea fi comparat cu driverId din transport */
  readonly myDriverId = computed(() => {
    const uid = this.auth.session()?.userId;
    return uid != null ? String(uid) : null;
  });

  readonly current = computed(() => {
    const myId = this.myDriverId();
    if (!myId) return [];
    return this.transportService.transports()
      .filter(t => String(t.driverId) === myId && (t.status === 'planificat' || t.status === 'in_livrare'))
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === 'in_livrare' ? -1 : 1;
        return a.oraPlecare.localeCompare(b.oraPlecare);
      });
  });

  // kept for isNotDriver check
  readonly planned = computed(() => {
    const myId = this.myDriverId();
    if (!myId) return [];
    return this.transportService.transports()
      .filter(t => String(t.driverId) === myId && t.status === 'planificat');
  });

  readonly active = computed(() => {
    const myId = this.myDriverId();
    if (!myId) return [];
    return this.transportService.transports()
      .filter(t => String(t.driverId) === myId && t.status === 'in_livrare');
  });

  readonly history = computed(() => {
    const myId = this.myDriverId();
    if (!myId) return [];
    return this.transportService.transports()
      .filter(t => String(t.driverId) === myId && t.status === 'livrat')
      .sort((a, b) => b.oraPlecare.localeCompare(a.oraPlecare));
  });

  /** True dacă userul curent nu are nicio cursă asignată (nu este șofer) */
  readonly isNotDriver = computed(() => {
    const myId = this.myDriverId();
    if (!myId) return true;
    return !this.transportService.transports().some(t => String(t.driverId) === myId);
  });

  /** Secțiuni pe șoferi — pentru view admin */
  readonly driverSections = computed(() => {
    const drivers    = this.transportService.drivers();
    const transports = this.transportService.transports();
    return drivers
      .map(driver => {
        const dId  = String(driver.id);
        const mine = transports.filter(t => String(t.driverId) === dId);
        // in_livrare first, then planificat, sorted by departure time
        const active   = mine.filter(t => t.status === 'in_livrare').sort((a, b) => a.oraPlecare.localeCompare(b.oraPlecare));
        const planned  = mine.filter(t => t.status === 'planificat').sort((a, b) => a.oraPlecare.localeCompare(b.oraPlecare));
        const history  = mine.filter(t => t.status === 'livrat').sort((a, b) => b.oraPlecare.localeCompare(a.oraPlecare));
        return { driver, active, planned, history };
      })
      .filter(s => s.active.length + s.planned.length + s.history.length > 0);
  });

  toggleDriverHistoric(driverId: string): void {
    this.showHistoricMap.update(m => ({ ...m, [driverId]: !m[String(driverId)] }));
  }

  showDriverHistoric(driverId: string): boolean {
    return !!this.showHistoricMap()[String(driverId)];
  }

  constructor(
    public  auth: AuthService,
    public  transportService: TransportService,
    private ordersService: OrdersService,
    private snackBar: MatSnackBar
  ) {}

  setTripStatus(t: Transport, status: TransportStatus): void {
    if (status === t.status) return;

    if (status === 'in_livrare') {
      const conflict = this.transportService.transports()
        .find(other => other.id !== t.id && String(other.driverId) === String(t.driverId) && other.status === 'in_livrare');
      if (conflict) {
        this.snackBar.open('Șoferul are deja o cursă în livrare. Finalizează-o mai întâi.', 'OK', { duration: 3500 });
        return;
      }
    }

    if (status === 'livrat' && !confirm('Marchezi cursa ca finalizată?')) return;

    this.transportService.setStatus(t.id, status);

    if (status === 'livrat') {
      for (const { orderId } of t.deliveries) {
        const order = this.getOrder(orderId);
        if (order) this.ordersService.updateDeliveryState(orderId, this._deliveredArr(order));
      }
    }

    const msg = status === 'in_livrare' ? 'Cursa a pornit!' : 'Livrare finalizată!';
    this.snackBar.open(msg, '', { duration: 2200 });
  }

  getOrder(id: string): Order | undefined {
    return this.ordersService.orders().find(o => o.id === id);
  }

  ordersForTransport(t: Transport): Order[] {
    return [...new Set(t.deliveries.map(d => d.orderId))]
      .map(id => this.getOrder(id)).filter((o): o is Order => !!o);
  }

  articleCount(t: Transport): number {
    return t.deliveries.reduce((s, d) => s + d.items.reduce((a, i) => a + i.qty, 0), 0);
  }

  getVehicleName(id: string): string {
    const v = this.transportService.getVehicle(id);
    return v ? (v.alias || v.denumire) : '—';
  }

  getVehiclePlate(id: string): string {
    return this.transportService.getVehicle(id)?.numarInmatriculare ?? '';
  }

  mapsLink(address: string): string {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  }

  fmt(iso: string): string {
    return this.transportService.formatDateTime(iso);
  }

  fmtTs(iso: string | undefined): string {
    if (!iso) return '—';
    return this.transportService.formatDateTime(iso);
  }

  private _deliveredArr(order: Order): number[] {
    const qty = new Array(order.products.length).fill(0);
    for (const t of this.transportService.transports()) {
      if (t.status !== 'livrat') continue;
      const d = t.deliveries.find(d => d.orderId === order.id);
      if (!d) continue;
      for (const item of d.items) {
        if (item.productIndex < qty.length) qty[item.productIndex] += item.qty;
      }
    }
    return qty;
  }
}
