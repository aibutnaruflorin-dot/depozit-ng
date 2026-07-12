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
  search          = signal('');
  selectedCatIds  = signal<string[]>([]);
  showCart        = signal(false);
  onlyInCart      = signal(false);
  cart            = signal<CartItem[]>([]);
  cuLivrare       = signal(false);
  selectedProduct = signal<Product | null>(null);
  sheetQty        = signal(1);

  readonly today = new Date().toISOString().split('T')[0];

  nameCtrl         = new FormControl('', Validators.required);
  phoneCtrl        = new FormControl('', [Validators.pattern(/^\d{10}$/)]);
  addressCtrl      = new FormControl('');
  deliveryDateCtrl = new FormControl('');
  deliveryTimeCtrl = new FormControl('');
  noteCtrl         = new FormControl('');

  readonly addToOrderId: string | null;
  readonly addPending: boolean;
  readonly returnTo: string;
  readonly addSource: 'comenzile-mele' | 'toate-comenzile';

  readonly addToOrder = computed(() => {
    if (!this.addToOrderId) return null;
    return this.ordersService.orders().find(o => o.id === this.addToOrderId) ?? null;
  });

  constructor(
    public catalogsService: CatalogsService,
    private ordersService: OrdersService,
    private auth: AuthService,
    private snackBar: MatSnackBar,
    public router: Router
  ) {
    const nav = this.router.getCurrentNavigation();
    const state = (nav?.extras?.state as any) ?? {};
    this.addToOrderId = state.addToOrderId ?? null;
    this.addPending   = !!state.addPending;
    this.returnTo     = state.returnTo ?? 'history-me';
    this.addSource    = state.source ?? 'comenzile-mele';
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

  readonly cartKeys = computed(() => new Set(this.cart().map(i => this.pkey(i.product))));

  readonly filtered = computed(() => {
    const q        = this.search().toLowerCase().trim();
    const cartOnly = this.onlyInCart();
    const keys     = this.cartKeys();
    return this.catalogsService.productsFor(this.selectedCatIds()).filter(p => {
      if (cartOnly && !keys.has(this.pkey(p))) return false;
      return !q || p.name.toLowerCase().includes(q) || String(p.nr).includes(q);
    });
  });

  readonly totalCuTVA   = computed(() => this.cart().reduce((s, i) => s + (i.product.pretCuTVA ?? 0) * i.qty, 0));
  readonly totalFaraTVA = computed(() => this.cart().reduce((s, i) => s + (i.product.pretFaraTVA ?? 0) * i.qty, 0));
  readonly totalMasa    = computed(() => this.cart().reduce((s, i) => s + (i.product.masaNeta ?? 0) * i.qty, 0));
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
    if (max <= 0) { this.openSheet(p); return; }
    const key = this.pkey(p);
    const existing = this.cart().find(i => this.pkey(i.product) === key);
    if (existing) {
      if (existing.qty >= max) { this.snackBar.open(`Stoc maxim disponibil: ${max} ${p.um}`, '', { duration: 1800, panelClass: ['snack-warn', 'snack-center'] }); return; }
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
    return qty === 0 ? 'dot-zero' : 'dot-ok';
  }

  stockBreakdown(p: Product): string | null {
    const { bufferQty, importedQty } = this.catalogsService.getStockThreeCol(p.catalogId, p.nr);
    if (bufferQty === 0) return null;
    const sign = bufferQty > 0 ? '+' : '';
    return `${importedQty} imp · ${sign}${bufferQty} ajust.`;
  }

  historyModal = signal<Product | null>(null);

  readonly productHistory = computed(() => {
    const p = this.historyModal();
    if (!p) return [];
    return this.catalogsService.stockLog().filter(e =>
      e.catalogId === p.catalogId && String(e.productNr) === String(p.nr)
    );
  });

  readonly SOURCE_LABELS: Record<string, string> = {
    manual: 'Manual', order: 'Comandă', cancel: 'Anulare',
    revise: 'Revizie', add_products: 'Ad. produse',
  };

  openHistory(p: Product): void {
    this.selectedProduct.set(null);
    this.historyModal.set(p);
  }
  closeHistory(): void { this.historyModal.set(null); }

  openSheet(p: Product): void {
    this.sheetQty.set(1);
    this.selectedProduct.set(p);
  }

  closeSheet(): void { this.selectedProduct.set(null); }

  sheetInc(): void {
    const p = this.selectedProduct();
    if (!p) return;
    if (this.sheetQty() < p.qty) {
      this.sheetQty.update(q => q + 1);
    } else {
      this.snackBar.open(`Stoc maxim disponibil: ${p.qty} ${p.um}`, '', {
        duration: 1800, panelClass: ['snack-warn', 'snack-center']
      });
    }
  }

  sheetDec(): void {
    if (this.sheetQty() > 1) this.sheetQty.update(q => q - 1);
  }

  addFromSheet(): void {
    const p = this.selectedProduct();
    if (!p) return;
    if (p.qty <= 0) {
      this.snackBar.open('Stoc epuizat.', '', { duration: 1800, panelClass: ['snack-warn', 'snack-center'] });
      this.closeSheet();
      return;
    }
    const qty = this.sheetQty();
    const key = this.pkey(p);
    const existing = this.cart().find(i => this.pkey(i.product) === key);
    if (existing) {
      this.cart.update(c => c.map(i =>
        this.pkey(i.product) === key ? { ...i, qty: Math.min(i.qty + qty, p.qty) } : i
      ));
    } else {
      this.cart.update(c => [...c, { product: p, qty: Math.min(qty, p.qty) }]);
    }
    this.closeSheet();
    this.snackBar.open(`✓ ${qty} × ${p.name.length > 30 ? p.name.slice(0, 30) + '…' : p.name} adăugat în coș`, '', {
      duration: 2000, panelClass: ['snack-success', 'snack-center']
    });
  }

  submit(): void {
    if (this.addToOrderId) {
      if (this.cart().length === 0) {
        this.snackBar.open('Adaugă cel puțin un produs.', '', { duration: 2500, panelClass: ['snack-warn', 'snack-center'] });
        return;
      }
      const existing = this.ordersService.orders().find(o => o.id === this.addToOrderId);
      if (!existing) { this.snackBar.open('Comanda nu mai există.', '', { duration: 2500 }); return; }

      const session = this.auth.session();
      if (!session) { this.auth.logout(); return; }

      const newProds: OrderProduct[] = this.cart().map(item => ({
        nr: item.product.nr, name: item.product.name, um: item.product.um,
        qty: item.qty, category: item.product.category, catalogId: item.product.catalogId,
        furnizor: item.product.furnizor, codExtern: item.product.codExtern,
        pretFaraTVA: item.product.pretFaraTVA, pretCuTVA: item.product.pretCuTVA,
        masaNeta: item.product.masaNeta,
      }));

      if (this.addPending) {
        // Pending — same mechanism as desktop "Adaugă produse" for sent orders
        const result = this.ordersService.addProductsToOrder(existing.id, newProds, {
          timestamp: new Date().toISOString(),
          userId: session.userId, userName: session.name,
          source: this.addSource, type: 'products_added',
          products: newProds.map(p => ({ name: p.name, qty: p.qty, um: p.um })),
        });
        if (!result.ok) {
          const list = result.insufficient.map(i => `${i.name}: ${i.available}/${i.requested}`).join(', ');
          this.snackBar.open(`Stoc insuficient: ${list}`, 'Închide', { duration: 5000, panelClass: ['snack-warn'] });
          return;
        }
        this.snackBar.open(`${newProds.length} produse adăugate (pending)!`, 'OK', {
          duration: 3000, panelClass: ['snack-success']
        });
      } else {
        if (existing.status !== 'draft') {
          this.snackBar.open('Ciornă indisponibilă.', '', { duration: 2500 }); return;
        }
        this.ordersService.updateDraftProducts(this.addToOrderId!, [...existing.products, ...newProds]);
        this.snackBar.open(`${newProds.length} produse adăugate la ciornă!`, 'OK', {
          duration: 3000, panelClass: ['snack-success']
        });
      }
      this.cart.set([]); clearCartStorage(); this.showCart.set(false);
      if (this.returnTo === 'history-all') {
        this.router.navigate(['/app/m-history-all'], { state: { openOrderId: this.addToOrderId } });
      } else {
        this.router.navigate(['/app/m-history-me']);
      }
      return;
    }

    this.nameCtrl.markAsTouched();
    this.phoneCtrl.markAsTouched();

    if (this.nameCtrl.invalid) {
      this.snackBar.open('Introduceți numele clientului.', '', { duration: 2500, panelClass: ['snack-warn', 'snack-center'] }); return;
    }
    if (this.cuLivrare()) {
      if (!this.phoneCtrl.value?.trim()) {
        this.snackBar.open('Telefonul este obligatoriu pentru comenzile cu livrare.', '', { duration: 3000, panelClass: ['snack-warn', 'snack-center'] }); return;
      }
      if (this.phoneCtrl.invalid) {
        this.snackBar.open('Introduceți exact 10 cifre pentru telefon.', '', { duration: 3000, panelClass: ['snack-warn', 'snack-center'] }); return;
      }
      if (!this.addressCtrl.value?.trim()) {
        this.snackBar.open('Adresa de livrare este obligatorie.', '', { duration: 3000, panelClass: ['snack-warn', 'snack-center'] }); return;
      }
      if (!this.deliveryDateCtrl.value) {
        this.snackBar.open('Data livrării este obligatorie.', '', { duration: 3000, panelClass: ['snack-warn', 'snack-center'] }); return;
      }
      if (!this.deliveryTimeCtrl.value?.trim()) {
        this.snackBar.open('Ora livrării este obligatorie.', '', { duration: 3000, panelClass: ['snack-warn', 'snack-center'] }); return;
      }
      const deliveryDt = new Date(`${this.deliveryDateCtrl.value}T${this.deliveryTimeCtrl.value}`);
      if (deliveryDt < new Date()) {
        this.snackBar.open('Data și ora livrării nu pot fi în trecut.', '', { duration: 3000, panelClass: ['snack-warn', 'snack-center'] }); return;
      }
    }
    if (this.cart().length === 0) {
      this.snackBar.open('Adaugă cel puțin un produs.', '', { duration: 2500, panelClass: ['snack-warn', 'snack-center'] }); return;
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
      cuLivrare:    this.cuLivrare() || undefined,
      deliveryDate: this.cuLivrare() ? (this.deliveryDateCtrl.value || undefined) : undefined,
      deliveryTime: this.cuLivrare() ? (this.deliveryTimeCtrl.value?.trim() || undefined) : undefined,
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
    this.addressCtrl.reset(); this.deliveryDateCtrl.reset();
    this.deliveryTimeCtrl.reset(); this.noteCtrl.reset();
    this.cuLivrare.set(false);

    this.snackBar.open('Comanda salvată! O trimiți din Comenzile mele.', 'Mergi acolo', {
      duration: 5000, panelClass: ['snack-success', 'snack-center']
    }).onAction().subscribe(() => this.router.navigate(['/app/m-history-me']));
  }

  private _addProduct(p: Product, qty: number): void {
    const key = this.pkey(p);
    if (this.cart().some(i => this.pkey(i.product) === key)) return;
    this.cart.update(c => [...c, { product: p, qty }]);
  }
}
