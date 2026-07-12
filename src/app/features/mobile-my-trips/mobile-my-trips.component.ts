import { Component, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../core/services/auth.service';
import { TransportService } from '../../core/services/transport.service';
import { OrdersService } from '../../core/services/orders.service';
import { CatalogsService } from '../../core/services/catalogs.service';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Transport, TransportStatus } from '../../core/models/transport.model';
import { Order } from '../../core/models/order.model';
import { MobileNavComponent } from '../../shared/mobile-nav/mobile-nav.component';

const STATUS_STEPS: TransportStatus[] = ['planificat', 'confirmat_sofer', 'in_livrare', 'livrat'];
const STATUS_LABELS: Record<string, string> = {
  planificat: 'Planificat', confirmat_sofer: 'Confirmat', in_livrare: 'În livrare', livrat: 'Livrat', anulat: 'Anulat'
};
const STEP_LABELS  = ['Planificat', 'Confirmat', 'Pornit', 'Livrat'];
const STEP_ACTIONS = ['Confirmă', 'Pornește cursa', 'Finalizează', ''];

@Component({
  selector: 'app-mobile-my-trips',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatSnackBarModule, MobileNavComponent],
  templateUrl: './mobile-my-trips.component.html',
  styleUrl: './mobile-my-trips.component.scss'
})
export class MobileMyTripsComponent {
  showHistory = signal(false);
  expandedId  = signal<string | null>(null);

  readonly STATUS_STEPS = STATUS_STEPS;
  readonly STEP_LABELS  = STEP_LABELS;
  readonly STEP_ACTIONS = STEP_ACTIONS;

  constructor(
    public  auth: AuthService,
    public  transportService: TransportService,
    public  ordersService: OrdersService,
    public  catalogsService: CatalogsService,
    private snackBar: MatSnackBar
  ) {}

  readonly myDriverId = computed(() => {
    const uid = this.auth.session()?.userId;
    return uid != null ? String(uid) : null;
  });

  readonly current = computed(() => {
    const myId = this.myDriverId();
    if (!myId) return [];
    return this.transportService.transports()
      .filter(t => String(t.driverId) === myId &&
        ['planificat', 'confirmat_sofer', 'in_livrare', 'anulat'].includes(t.status))
      .sort((a, b) => {
        const ord = ['in_livrare', 'confirmat_sofer', 'planificat', 'anulat'];
        return ord.indexOf(a.status) - ord.indexOf(b.status) || a.oraPlecare.localeCompare(b.oraPlecare);
      });
  });

  readonly history = computed(() => {
    const myId = this.myDriverId();
    if (!myId) return [];
    return this.transportService.transports()
      .filter(t => String(t.driverId) === myId && t.status === 'livrat')
      .sort((a, b) => b.oraPlecare.localeCompare(a.oraPlecare))
      .slice(0, 20);
  });

  readonly isNotDriver = computed(() => {
    const myId = this.myDriverId();
    if (!myId) return true;
    return !this.transportService.transports().some(t => String(t.driverId) === myId);
  });

  // ── Display helpers ───────────────────────────────────────────────────────

  stepIndex(t: Transport): number {
    return STATUS_STEPS.indexOf(t.status as TransportStatus);
  }

  statusLabel(t: Transport): string { return STATUS_LABELS[t.status] ?? t.status; }

  vehicleName(t: Transport): string {
    const v = this.transportService.getVehicle(t.vehicleId);
    return v?.alias || v?.denumire || t.vehicleId;
  }

  ordersForTransport(t: Transport): Order[] {
    return [...new Set(t.deliveries.map(d => d.orderId))]
      .map(id => this.ordersService.orders().find(o => o.id === id))
      .filter((o): o is Order => !!o);
  }

  deliveryItems(t: Transport, orderId: string): { name: string; qty: number; um: string }[] {
    const delivery = t.deliveries.find(d => d.orderId === orderId);
    const order    = this.ordersService.orders().find(o => o.id === orderId);
    if (!delivery || !order) return [];
    return delivery.items
      .filter(item => item.qty > 0)
      .map(item => {
        const p = order.products[item.productIndex];
        return { name: p?.name ?? '?', qty: item.qty, um: p?.um ?? '' };
      });
  }

  getDeliveryNote(t: Transport, orderId: string): string {
    return t.deliveries.find(d => d.orderId === orderId)?.observatii
      ?? this.ordersService.orders().find(o => o.id === orderId)?.client.note
      ?? '';
  }

  isOverdue(t: Transport): boolean {
    return t.status !== 'livrat' && t.status !== 'anulat' && new Date(t.oraSosire).getTime() < Date.now();
  }

  fmt(iso: string): string {
    return this.transportService.formatDateTime(iso);
  }

  mapsLink(address: string): string {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  }

  toggleExpand(id: string): void { this.expandedId.update(v => v === id ? null : id); }

  // ── Status transitions ────────────────────────────────────────────────────

  advance(t: Transport): void {
    const idx = STATUS_STEPS.indexOf(t.status as TransportStatus);
    if (idx < 0 || idx >= STATUS_STEPS.length - 1) return;

    const next = STATUS_STEPS[idx + 1];

    if (next === 'in_livrare') {
      const conflict = this.transportService.transports()
        .find(other => other.id !== t.id && String(other.driverId) === String(t.driverId) && other.status === 'in_livrare');
      if (conflict) {
        this.snackBar.open('Ai deja o cursă în livrare. Finalizează-o mai întâi.', 'OK', { duration: 3500 });
        return;
      }
    }

    if (next === 'livrat' && !confirm('Marchezi cursa ca finalizată?')) return;

    this.transportService.setStatus(t.id, next);

    if (next === 'livrat') {
      for (const { orderId } of t.deliveries) {
        const order = this.ordersService.orders().find(o => o.id === orderId);
        if (order) this.ordersService.updateDeliveryState(orderId, this._deliveredArr(order));
      }
    }

    const msgs: Partial<Record<TransportStatus, string>> = {
      confirmat_sofer: 'Cursa confirmată!',
      in_livrare:      'Cursa a pornit!',
      livrat:          'Livrare finalizată!'
    };
    this.snackBar.open(msgs[next] ?? 'Status actualizat.', '', { duration: 2200, panelClass: ['snack-success'] });
  }

  confirmCancellation(t: Transport): void {
    this.transportService.setStatus(t.id, 'anulat');
    this.snackBar.open('Anulare confirmată.', '', { duration: 2500 });
  }

  // ── Private ───────────────────────────────────────────────────────────────

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
