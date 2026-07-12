import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { AuthService } from '../../core/services/auth.service';
import { OrdersService } from '../../core/services/orders.service';
import { TransportService } from '../../core/services/transport.service';
import { AuditService } from '../../core/services/audit.service';
import { MobileNavComponent } from '../../shared/mobile-nav/mobile-nav.component';

@Component({
  selector: 'app-mobile-settings',
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule, MatSnackBarModule, MobileNavComponent],
  templateUrl: './mobile-settings.component.html',
  styleUrl: './mobile-settings.component.scss'
})
export class MobileSettingsComponent {
  confirmReset = signal(false);

  constructor(
    public auth: AuthService,
    private ordersService: OrdersService,
    private transportService: TransportService,
    private audit: AuditService,
    private snackBar: MatSnackBar
  ) {}

  executePeriodReset(): void {
    this.ordersService.resetPeriod();
    this.transportService.resetPeriod();
    this.confirmReset.set(false);
    const session = this.auth.session();
    if (session) this.audit.log(session.userId, 'PERIOD_RESET', 'Curățare sesiune: comenzi și curse șterse');
    this.snackBar.open('Curățare sesiune test finalizată. Comenzi și curse șterse.', 'OK', { duration: 4000, panelClass: ['snack-success'] });
  }
}
