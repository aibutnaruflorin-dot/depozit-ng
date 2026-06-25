import { Component, computed, signal, effect, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, FormControl, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CatalogsService } from '../../core/services/catalogs.service';
import { OrdersService, generateId } from '../../core/services/orders.service';
import { AuthService } from '../../core/services/auth.service';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Product } from '../../core/models/product.model';
import { Order, OrderProduct } from '../../core/models/order.model';
import { MobileNavComponent } from '../../shared/mobile-nav/mobile-nav.component';

const CART_LS_KEY = 'depot.newOrderCart';
interface CartItem { product: Product; qty: number; }
function loadCart(): CartItem[] {
  try { const r = localStorage.getItem(CART_LS_KEY); return r ? JSON.parse(r) : []; } catch { return []; }
}
function saveCart(items: CartItem[]): void {
  try { localStorage.setItem(CART_LS_KEY, JSON.stringify(items)); } catch {}
}
function clearCartStorage(): void {
  try { localStorage.removeItem(CART_LS_KEY); } catch {}
}

@Component({
  selector: 'app-mobile-new-order',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, MatIconModule, MatSnackBarModule, MobileNavComponent],
  templateUrl: './mobile-new-order.component.html',
  styleUrl: './mobile-new-order.component.scss'
})
export class MobileNewOrderComponent implements OnInit {
  search         = signal('');
  selectedCatIds = signal<string[]>([]);
  showCart       = signal(false);
  cart           = signal<CartItem[]>([]);
  cuLivrare      = signal(false);

  nameCtrl     = new FormControl('', Validators.required);
  phoneCtrl    = new FormControl('');
  addressCtrl  = new FormControl('');
  noteCtrl     = new FormControl('');

  constructor(
    public catalogsService: CatalogsService,
    private ordersService: OrdersService,
    private auth: AuthService,
    private snackBar: MatSnackBar,
    private router: Router
  ) {
    effect(() => saveCart(this.cart()));
  }

  ngOnInit(): void {
    const saved = loadCart();
    if (saved.length) this.cart.set(saved);

    const product = (window.history.state as any)?.product as Product | undefined;
    if (product) {
      this._addProduct(product, 1);
      this.showCart.set(false);
    }
  }

  readonly allSelected = computed(() => this.selectedCatIds().length === 0);

  readonly filtered = computed(() => {
    const q = this.search().toLowerCase().trim();
    return this.catalogsService.productsFor(this.selectedCatIds()).filter(p =>
      !q || p.name.toLowerCase().includes(q) || String(p.nr).includes(q)
    );
  });

  readonly totalCuTVA   = computed(() => this.cart().reduce((s, i) => s + (i.product.pretCuTVA ?? 0) * i.qty, 0));
  readonly totalFaraTVA = computed(() => this.cart().reduce((s, i) => s + (i.product.pretFaraTVA ?? 0) * i.qty, 0));
  readonly cartCount    = computed(() => this.cart().reduce((s, i) => s + i.qty, 0));

  toggleCatalog(id: string): void {
    this.selectedCatIds.update(ids =>
      ids.includes(id) ? ids.filter(i => i !== id) : [...ids, id]
    );
  }

  pkey(p: Product): string { return `${p.catalogId}::${p.nr}`; }

  qtyOf(p: Product): number {
    return this.cart().find(i => this.pkey(i.product) === this.pkey(p))?.qty ?? 0;
  }

  inc(p: Product): void {
    const max = p.qty;
    if (max <= 0) { this.snackBar.open('Stoc epuizat.', '', { duration: 1500 }); return; }
    const key = this.pkey(p);
    const existing = this.cart().find(i => this.pkey(i.product) === key);
    if (existing) {
      if (existing.qty >= max) { this.snackBar.open(`Max ${max} ${p.um}`, '', { duration: 1500 }); return; }
      this.cart.update(c => c.map(i => this.pkey(i.product) === key ? { ...i, qty: i.qty + 1 } : i));
    } else {
      this._addProduct(p, 1);
    }
  }

  dec(p: Product): void {
    const key = this.pkey(p);
    const existing = this.cart().find(i => this.pkey(i.product) === key);
    if (!existing) return;
    if (existing.qty <= 1) {
      this.cart.update(c => c.filter(i => this.pkey(i.product) !== key));
    } else {
      this.cart.update(c => c.map(i => this.pkey(i.product) === key ? { ...i, qty: i.qty - 1 } : i));
    }
  }

  removeFromCart(p: Product): void {
    this.cart.update(c => c.filter(i => this.pkey(i.product) !== this.pkey(p)));
  }

  clearCart(): void { this.cart.set([]); clearCartStorage(); }

  catalogColor(catalogId: string): string { return this.catalogsService.borderColor(catalogId); }
  catalogName(catalogId: string): string  { return this.catalogsService.getById(catalogId)?.name ?? ''; }

  stockDotClass(qty: number): string {
    if (qty === 0) return 'dot-zero'; if (qty <= 5) return 'dot-low'; return 'dot-ok';
  }

  submit(): void {
    this.nameCtrl.markAsTouched();
    if (this.nameCtrl.invalid) {
      this.snackBar.open('Introduceți numele clientului.', '', { duration: 2500 }); return;
    }
    if (this.cart().length === 0) {
      this.snackBar.open('Adaugă cel puțin un produs.', '', { duration: 2500 }); return;
    }
    const session = this.auth.session();
    if (!session) { this.auth.logout(); return; }

    const order: Order = {
      id:        generateId(),
      timestamp: new Date().toISOString(),
      agent:     { id: session.userId, name: session.name, username: session.username },
      client:    {
        name:    (this.nameCtrl.value || '').trim(),
        phone:   (this.phoneCtrl.value || '').trim(),
        email:   '',
        note:    (this.noteCtrl.value || '').trim(),
        address: (this.addressCtrl.value || '').trim() || undefined
      },
      cuLivrare: this.cuLivrare() || undefined,
      products: this.cart().map(i => ({
        nr: i.product.nr, name: i.product.name, um: i.product.um, qty: i.qty,
        category: i.product.category, catalogId: i.product.catalogId,
        furnizor: i.product.furnizor, codExtern: i.product.codExtern,
        pretFaraTVA: i.product.pretFaraTVA, pretCuTVA: i.product.pretCuTVA,
        masaNeta: i.product.masaNeta,
      } as OrderProduct)),
      status: 'draft'
    };

    this.ordersService.saveDraftOrder(order);
    this.cart.set([]); clearCartStorage();
    this.showCart.set(false);
    this.nameCtrl.reset(); this.phoneCtrl.reset();
    this.addressCtrl.reset(); this.noteCtrl.reset();
    this.cuLivrare.set(false);

    this.snackBar.open('Comanda salvată! O trimiți din Comenzile mele.', 'Mergi acolo', {
      duration: 5000, panelClass: ['snack-success']
    }).onAction().subscribe(() => this.router.navigate(['/app/m-history-me']));
  }

  private _addProduct(p: Product, qty: number): void {
    const key = this.pkey(p);
    if (this.cart().some(i => this.pkey(i.product) === key)) return;
    this.cart.update(c => [...c, { product: p, qty }]);
  }
}
