import { Component, ViewChild, OnInit, signal } from '@angular/core';
import { RouterModule, Router, NavigationEnd } from '@angular/router';
import { CommonModule } from '@angular/common';
import { filter } from 'rxjs/operators';
import { BreakpointObserver } from '@angular/cdk/layout';
import { AuthService } from '../../core/services/auth.service';
import { CatalogsService } from '../../core/services/catalogs.service';
import { StorageService } from '../../core/services/storage.service';
import { AppPermission, DEFAULT_PERMISSIONS } from '../../core/models/app-permission.model';
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
  pageId: string;
  adminOnly?: boolean;
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
    { label: 'Catalog',          icon: 'inventory_2',       route: '/app/catalog',     pageId: 'catalog' },
    { label: 'Comandă nouă',     icon: 'add_shopping_cart', route: '/app/new-order',   pageId: 'comenzi_noi' },
    { label: 'Comenzile mele',   icon: 'list_alt',          route: '/app/history-me',  pageId: 'comenzi' },
    { label: 'Toate comenzile',  icon: 'bar_chart',         route: '/app/history-all', pageId: 'istoric' },
    { label: 'Transport',        icon: 'local_shipping',    route: '/app/transport',   pageId: 'transport' },
    { label: 'Cursele mele',     icon: 'drive_eta',         route: '/app/my-trips',    pageId: 'cursele_mele' },
    { label: 'Setări',           icon: 'settings',          route: '/app/settings',    pageId: 'setari',     adminOnly: true },
    { label: 'Manual',           icon: 'menu_book',         route: '/app/manual',      pageId: 'manual' },
    { label: 'Securitate',        icon: 'security',          route: '/app/security',    pageId: 'setari',     adminOnly: true },
  ];

  constructor(
    public  auth: AuthService,
    private catalogs: CatalogsService,
    private storage: StorageService,
    private router: Router,
    private bp: BreakpointObserver
  ) {}

  ngOnInit(): void {
    this.bp.observe(['(max-width: 768px)']).subscribe(s => {
      this.isMobile = s.matches;
    });

    this.router.events.pipe(filter(e => e instanceof NavigationEnd)).subscribe((e: any) => {
      this.activeRoute = e.url.split('?')[0];
    });
    this.activeRoute = this.router.url.split('?')[0];

    const saved = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const dark = saved === 'dark' || (!saved && prefersDark);
    this.darkMode.set(dark);
    if (dark) document.documentElement.setAttribute('data-theme', 'dark');

    this.catalogs.loadOnStartup();
  }

  get visibleNavItems(): NavItem[] {
    const session = this.auth.session();
    if (!session) return [];
    if (session.isAdmin) return this.navItems;

    const perms: AppPermission[] = this.storage.get('app_permissions') ?? [];
    const perm = perms.find(p => p.id === session.role);

    return this.navItems.filter(item => {
      if (item.adminOnly) return false;
      const access = perm?.pages?.[item.pageId] ?? 'none';
      return access !== 'none';
    });
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
