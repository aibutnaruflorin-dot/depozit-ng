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
  showHistory     = signal(false);
  showAllHistory  = signal(false);
  expandedId      = signal<string | null>(null);
  showHistoricMap = signal<Record<string, boolean>>({});

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

  // ── Driver-view computeds (U-03: secțiuni separate per status) ────────────

  readonly myDriverId = computed(() => {
    const uid = this.auth.session()?.userId;
    return uid != null ? String(uid) : null;
  });

  readonly tripsInDelivery = computed(() => {
    const myId = this.myDriverId();
    if (!myId) return [];
    return this.transportService.transports()
      .filter(t => String(t.driverId) === myId && t.status === 'in_livrare')
      .sort((a, b) => a.oraPlecare.localeCompare(b.oraPlecare));
  });

  readonly tripsConfirmed = computed(() => {
    const myId = this.myDriverId();
    if (!myId) return [];
    return this.transportService.transports()
      .filter(t => String(t.driverId) === myId && t.status === 'confirmat_sofer')
      .sort((a, b) => a.oraPlecare.localeCompare(b.oraPlecare));
  });

  readonly tripsPlanned = computed(() => {
    const myId = this.myDriverId();
    if (!myId) return [];
    return this.transportService.transports()
      .filter(t => String(t.driverId) === myId && t.status === 'planificat')
      .sort((a, b) => a.oraPlecare.localeCompare(b.oraPlecare));
  });

  readonly tripsCancelled = computed(() => {
    const myId = this.myDriverId();
    if (!myId) return [];
    return this.transportService.transports()
      .filter(t => String(t.driverId) === myId && t.status === 'anulat')
      .sort((a, b) => a.oraPlecare.localeCompare(b.oraPlecare));
  });

  readonly history = computed(() => {
    const myId = this.myDriverId();
    if (!myId) return [];
    return this.transportService.transports()
      .filter(t => String(t.driverId) === myId && t.status === 'livrat')
      .sort((a, b) => b.oraPlecare.localeCompare(a.oraPlecare));
  });

  // U-07: afișare paginată, show all la cerere
  readonly historyDisplayed = computed(() => {
    const h = this.history();
    return this.showAllHistory() ? h : h.slice(0, 20);
  });

  readonly isNotDriver = computed(() => {
    const myId = this.myDriverId();
    if (!myId) return true;
    return !this.transportService.transports().some(t => String(t.driverId) === myId);
  });

  readonly hasActiveTrips = computed(() =>
    this.tripsInDelivery().length + this.tripsConfirmed().length +
    this.tripsPlanned().length + this.tripsCancelled().length > 0
  );

  // ── Admin-view computed ───────────────────────────────────────────────────

  readonly driverSections = computed(() => {
    const drivers    = this.transportService.drivers();
    const transports = this.transportService.transports();
    return drivers
      .map(driver => {
        const dId = String(driver.id);
        const mine = transports.filter(t => String(t.driverId) === dId);
        const active  = mine.filter(t => t.status === 'in_livrare' || t.status === 'confirmat_sofer')
                            .sort((a, b) => a.oraPlecare.localeCompare(b.oraPlecare));
        const planned = mine.filter(t => t.status === 'planificat')
                            .sort((a, b) => a.oraPlecare.localeCompare(b.oraPlecare));
        const hist    = mine.filter(t => t.status === 'livrat')
                            .sort((a, b) => b.oraPlecare.localeCompare(a.oraPlecare));
        return { driver, active, planned, hist };
      })
      .filter(s => s.active.length + s.planned.length + s.hist.length > 0);
  });

  // ── Display helpers ───────────────────────────────────────────────────────

  stepIndex(t: Transport): number {
    return STATUS_STEPS.indexOf(t.status as TransportStatus);
  }

  statusLabel(t: Transport): string { return STATUS_LABELS[t.status] ?? t.status; }

  statusChipClass(status: string): string {
    const map: Record<string, string> = {
      in_livrare:      'mm-chip--active',
      confirmat_sofer: 'mm-chip--confirm',
      planificat:      'mm-chip--plan',
      livrat:          'mm-chip--done',
      anulat:          'mm-chip--cancel',
    };
    return map[status] ?? '';
  }

  vehicleName(t: Transport): string {
    const v = this.transportService.getVehicle(t.vehicleId);
    return v?.alias || v?.denumire || t.vehicleId;
  }

  getVehiclePlate(vehicleId: string): string {
    return this.transportService.getVehicle(vehicleId)?.numarInmatriculare ?? '';
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

  deliveryItemsCount(t: Transport, orderId: string): number {
    return this.deliveryItems(t, orderId).length;
  }

  getDeliveryNote(t: Transport, orderId: string): string {
    return t.deliveries.find(d => d.orderId === orderId)?.observatii
      ?? this.ordersService.orders().find(o => o.id === orderId)?.client.note
      ?? '';
  }

  isOverdue(t: Transport): boolean {
    return t.status !== 'livrat' && t.status !== 'anulat' && new Date(t.oraSosire).getTime() < Date.now();
  }

  fmt(iso: string): string { return this.transportService.formatDateTime(iso); }

  fmtTs(iso: string | undefined): string {
    if (!iso) return '—';
    return this.transportService.formatDateTime(iso);
  }

  mapsLink(address: string): string {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  }

  // ── F-01: Greutate + tonaj ────────────────────────────────────────────────

  tripTotalWeight(t: Transport): number {
    return this.ordersForTransport(t).reduce((sum, order) => {
      const d = t.deliveries.find(del => del.orderId === order.id);
      if (!d) return sum;
      return sum + d.items.reduce((si, item) => {
        const p = order.products[item.productIndex];
        if (!p) return si;
        const masa = p.masaNeta
          ?? this.catalogsService.findProduct(p.catalogId ?? '', p.nr)?.masaNeta
          ?? 0;
        return si + masa * item.qty;
      }, 0);
    }, 0);
  }

  tripWeightWarn(t: Transport): boolean {
    const vehicle = this.transportService.getVehicle(t.vehicleId);
    if (!vehicle?.tonajMaxim) return false;
    return this.tripTotalWeight(t) > vehicle.tonajMaxim;
  }

  fmtWeight(kg: number): string {
    if (kg <= 0) return '';
    return kg >= 1000
      ? `${(kg / 1000).toFixed(2).replace(/\.?0+$/, '')} t`
      : `${kg.toFixed(1).replace(/\.0$/, '')} kg`;
  }

  // ── F-02: Durată + log tranziții ──────────────────────────────────────────

  tripDuration(t: Transport): string {
    if (!t.startedAt || !t.completedAt) return '—';
    const ms = new Date(t.completedAt).getTime() - new Date(t.startedAt).getTime();
    if (ms <= 0) return '—';
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  tripTotalDuration(t: Transport): string {
    if (!t.completedAt) return '—';
    const ms = new Date(t.completedAt).getTime() - new Date(t.createdAt).getTime();
    if (ms <= 0) return '—';
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  // ── UI interaction ────────────────────────────────────────────────────────

  toggleExpand(id: string): void { this.expandedId.update(v => v === id ? null : id); }

  toggleDriverHistoric(driverId: string | number): void {
    const key = String(driverId);
    this.showHistoricMap.update(m => ({ ...m, [key]: !m[key] }));
  }

  showDriverHistoric(driverId: string | number): boolean {
    return !!this.showHistoricMap()[String(driverId)];
  }

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
      confirmat_sofer: 'Ai confirmat primirea sarcinii!',  // U-01: mesaj contextual
      in_livrare:      'Cursa a pornit!',
      livrat:          'Livrare finalizată!'
    };
    this.snackBar.open(msgs[next] ?? 'Status actualizat.', '', { duration: 2200, panelClass: ['snack-success'] });
  }

  // U-04: admin poate seta orice status (inclusiv skip pași)
  setTripStatus(t: Transport, status: TransportStatus): void {
    if (status === t.status) return;

    if (status === 'in_livrare') {
      const conflict = this.transportService.transports()
        .find(other => other.id !== t.id && String(other.driverId) === String(t.driverId) && other.status === 'in_livrare');
      if (conflict) {
        this.snackBar.open('Șoferul are deja o cursă în livrare.', 'OK', { duration: 3500 });
        return;
      }
    }

    if (status === 'livrat' && !confirm('Marchezi cursa ca finalizată?')) return;

    this.transportService.setStatus(t.id, status);

    if (status === 'livrat') {
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
    this.snackBar.open(msgs[status] ?? 'Status actualizat.', '', { duration: 2200, panelClass: ['snack-success'] });
  }

  // S-01 fix: 'sters' arhivează cursa din view-ul șoferului
  confirmCancellation(t: Transport): void {
    this.transportService.setStatus(t.id, 'sters');
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
