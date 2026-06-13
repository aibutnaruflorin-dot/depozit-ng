import { Component, ViewChild, OnInit, signal } from '@angular/core';
import { RouterModule, Router, NavigationEnd } from '@angular/router';
import { CommonModule } from '@angular/common';
import { filter } from 'rxjs/operators';
import { BreakpointObserver } from '@angular/cdk/layout';
import { AuthService } from '../../core/services/auth.service';
import { CatalogsService } from '../../core/services/catalogs.service';
import { MatSidenavModule, MatSidenav } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';

interface NavItem {
  label: string;
  icon: string;
  route: string;
  roles: string[];
}

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [
    CommonModule, RouterModule,
    MatSidenavModule, MatToolbarModule, MatButtonModule,
    MatIconModule, MatListModule, MatDividerModule, MatTooltipModule
  ],
  templateUrl: './layout.component.html',
  styleUrl:    './layout.component.scss'
})
export class LayoutComponent implements OnInit {
  @ViewChild('sidenav') sidenav!: MatSidenav;

  isMobile = false;
  darkMode = signal(false);
  activeRoute = '';

  readonly navItems: NavItem[] = [
    { label: 'Catalog',         icon: 'inventory_2',       route: '/app/catalog',     roles: ['keyuser', 'agent'] },
    { label: 'Comandă nouă',    icon: 'add_shopping_cart', route: '/app/new-order',   roles: ['keyuser', 'agent'] },
    { label: 'Comenzile mele',  icon: 'list_alt',          route: '/app/history-me',  roles: ['keyuser', 'agent'] },
    { label: 'Toate comenzile', icon: 'bar_chart',         route: '/app/history-all', roles: ['keyuser'] },
    { label: 'Transport',       icon: 'local_shipping',    route: '/app/transport',   roles: ['keyuser', 'agent'] },
    { label: 'Cursele mele',   icon: 'drive_eta',         route: '/app/my-trips',    roles: ['keyuser', 'agent'] },
    { label: 'Setări',          icon: 'settings',          route: '/app/settings',    roles: ['keyuser'] },
    { label: 'Contul meu',      icon: 'manage_accounts',   route: '/app/account',     roles: ['keyuser', 'agent'] },
    { label: 'Manual',          icon: 'menu_book',         route: '/app/manual',      roles: ['keyuser', 'agent'] },
    { label: 'Pagina nouă',    icon: 'security',          route: '/app/security',    roles: ['keyuser', 'agent'] },
  ];

  constructor(
    public auth: AuthService,
    private catalogs: CatalogsService,
    private router: Router,
    private bp: BreakpointObserver
  ) {}

  ngOnInit(): void {
    this.bp.observe(['(max-width: 768px)']).subscribe(s => {
      this.isMobile = s.matches;
    });

    // Track active route
    this.router.events.pipe(filter(e => e instanceof NavigationEnd)).subscribe((e: any) => {
      this.activeRoute = e.url.split('?')[0];
    });
    this.activeRoute = this.router.url.split('?')[0];

    // Dark mode
    const saved = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const dark = saved === 'dark' || (!saved && prefersDark);
    this.darkMode.set(dark);
    if (dark) document.documentElement.setAttribute('data-theme', 'dark');

    this.catalogs.loadOnStartup();
  }

  get visibleNavItems(): NavItem[] {
    const role = this.auth.session()?.role ?? 'agent';
    return this.navItems.filter(item => item.roles.includes(role));
  }

  isActive(route: string): boolean {
    return this.activeRoute === route;
  }

  navigate(route: string): void {
    this.router.navigate([route]);
    if (this.isMobile) this.sidenav?.close();
  }

  toggleTheme(): void {
    const dark = !this.darkMode();
    this.darkMode.set(dark);
    if (dark) {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('theme', 'light');
    }
  }

  logout(): void {
    if (confirm('Ești sigur că vrei să te deconectezi?')) this.auth.logout();
  }
}
