import { Component, computed, signal } from '@angular/core';
import { RouterModule, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-mobile-nav',
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule],
  templateUrl: './mobile-nav.component.html',
  styleUrl: './mobile-nav.component.scss'
})
export class MobileNavComponent {
  showMore = signal(false);

  constructor(public auth: AuthService, private router: Router) {}

  readonly isDriver = computed(() => this.auth.session()?.role === 'sofer');

  transportRoute(): string {
    return this.isDriver() ? '/app/m-my-trips' : '/app/m-transport';
  }

  navigateTo(path: string): void {
    this.showMore.set(false);
    this.router.navigate([path]);
  }
}
