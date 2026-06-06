import { Component, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { CatalogsService } from '../../core/services/catalogs.service';
import { OrdersService, generateId } from '../../core/services/orders.service';
import { Product } from '../../core/models/product.model';
import { Order, OrderProduct } from '../../core/models/order.model';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';

export interface CartItem { product: Product; qty: number; }

@Component({
  selector: 'app-new-order',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, FormsModule,
    MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule,
    MatDividerModule, MatSelectModule, MatCheckboxModule, MatSnackBarModule, MatTooltipModule
  ],
  templateUrl: './new-order.component.html',
  styleUrl:    './new-order.component.scss'
})
export class NewOrderComponent implements OnInit {
  nameCtrl    = new FormControl('', Validators.required);
  phoneCtrl   = new FormControl('', [Validators.pattern(/^\d{10}$/)]);
  addressCtrl = new FormControl('');
  helperCtrl  = new FormControl('');
  noteCtrl    = new FormControl('');

  searchQuery      = signal('');
  categoryFilter   = signal('');
  furnizorFilter   = signal<string[]>([]);
  codExternFilter  = signal('');
  selectedCatIds   = signal<string[]>([]);
  cart           = signal<CartItem[]>([]);
  showCart       = signal(false);
  displayMode    = signal<'mixed' | 'grouped'>('mixed');

  private _pendingQty     = signal<Record<string, number | undefined>>({});
  readonly pendingQtyMap  = this._pendingQty.asReadonly();

  confirmDeleteKey = signal<string | null>(null);

  submitting = false;
  submitted  = false;
  lastOrder: Order | null = null;
  lastOrderText = '';

  constructor(
    private auth: AuthService,
    public  catalogsService: CatalogsService,
    private ordersService: OrdersService,
    private snackBar: MatSnackBar,
    private router: Router
  ) {}

  ngOnInit(): void {}

  furnizorDropdownOpen = signal(false);
  furnizorSearch       = signal('');

  readonly allCatSelected = computed(() => this.selectedCatIds().length === 0);
  readonly categories     = computed(() => this.catalogsService.categoriesFor(this.selectedCatIds()));
  readonly furnizors      = computed(() => this.catalogsService.furnizorsFor(this.selectedCatIds()));

  readonly filteredFurnizors = computed(() => {
    const s = this.furnizorSearch().toLowerCase().trim();
    return s ? this.furnizors().filter(f => f.toLowerCase().includes(s)) : this.furnizors();
  });

  readonly allFurnizorsSelected = computed(() =>
    this.furnizors().length > 0 && this.furnizorFilter().length === this.furnizors().length
  );

  toggleFurnizorDropdown(): void { this.furnizorDropdownOpen.update(v => !v); }
  closeFurnizorDropdown(): void  { this.furnizorDropdownOpen.set(false); this.furnizorSearch.set(''); }

  toggleFurnizorItem(f: string): void {
    this.furnizorFilter.update(arr =>
      arr.includes(f) ? arr.filter(x => x !== f) : [...arr, f]
    );
  }

  toggleAllFurnizors(): void {
    if (this.allFurnizorsSelected()) {
      this.furnizorFilter.set([]);
    } else {
      this.furnizorFilter.set([...this.furnizors()]);
    }
  }

  toggleCatalog(id: string): void {
    this.selectedCatIds.update(ids =>
      ids.includes(id) ? ids.filter(i => i !== id) : [...ids, id]
    );
    this.categoryFilter.set('');
    this.furnizorFilter.set([]);
  }

  toggleDisplayMode(): void {
    this.displayMode.update(m => m === 'mixed' ? 'grouped' : 'mixed');
  }

  readonly suggestions = computed(() => {
    const q          = this.searchQuery().trim().toLowerCase();
    const cat        = this.categoryFilter();
    const furnizors  = this.furnizorFilter();
    const codExtern  = this.codExternFilter().trim().toLowerCase();
    const mode       = this.displayMode();
    const base = mode === 'grouped'
      ? this.catalogsService.productsForGrouped(this.selectedCatIds())
      : this.catalogsService.productsFor(this.selectedCatIds());
    if (!q && !cat && furnizors.length === 0 && !codExtern) return base.slice(0, 200);
    return base.filter(p => {
      const matchQ        = !q                   || p.name.toLowerCase().includes(q) || String(p.nr).includes(q);
      const matchCat      = !cat                 || p.category === cat;
      const matchFurnizor = furnizors.length === 0 || furnizors.includes(p.furnizor ?? '');
      const matchCodExt   = !codExtern           || (p.codExtern ?? '').toLowerCase().includes(codExtern);
      return matchQ && matchCat && matchFurnizor && matchCodExt;
    }).slice(0, 200);
  });

  rowBg(catalogId: string): string     { return this.catalogsService.bgColor(catalogId, 0.08); }
  rowBorder(catalogId: string): string { return this.catalogsService.borderColor(catalogId); }

  /** Unique key per product across catalogs */
  pkey(p: Product): string { return `${p.catalogId}::${p.nr}`; }

  /* ── Pending qty (list rows) — default 0, min 0 ── */
  getPendingQty(p: Product): number {
    return this._pendingQty()[this.pkey(p)] ?? 0;
  }
  setPendingQty(p: Product, val: string | number): void {
    const qty = Math.max(0, parseInt(String(val)) || 0);
    this._pendingQty.update(m => ({ ...m, [this.pkey(p)]: qty }));
  }
  incPending(p: Product): void { this.setPendingQty(p, this.getPendingQty(p) + 1); }
  decPending(p: Product): void {
    const current = this.getPendingQty(p);
    if (current <= 0) return;
    const newQty = current - 1;
    this.setPendingQty(p, newQty);
    if (newQty === 0 && this.isInCart(p)) {
      const key = this.pkey(p);
      this.cart.update(c => c.filter(i => this.pkey(i.product) !== key));
    }
  }

  /* ── Cart helpers ── */
  isInCart(p: Product): boolean {
    const key = this.pkey(p);
    return this.cart().some(i => this.pkey(i.product) === key);
  }

  openCart():  void { this.showCart.set(true); }
  closeCart(): void { this.showCart.set(false); this.confirmDeleteKey.set(null); }

  /** Read cart qty directly from signal for reactive template binding */
  cartQtyOf(product: Product): number {
    return this.cart().find(i => this.pkey(i.product) === this.pkey(product))?.qty ?? 0;
  }

  addProduct(product: Product): void {
    const pending = this.getPendingQty(product);
    const key     = this.pkey(product);
    const qty     = pending > 0 ? pending : 1;
    if (pending === 0) {
      this._pendingQty.update(m => ({ ...m, [key]: 1 }));
    }
    if (this.isInCart(product)) {
      this.cart.update(c => c.map(i =>
        this.pkey(i.product) === key ? { ...i, qty } : i
      ));
      this.snackBar.open(`Actualizat: ${qty} ${product.um}`, '', { duration: 1000, panelClass: ['snack-success'] });
    } else {
      this.cart.update(c => [...c, { product, qty }]);
      this.snackBar.open(`Adăugat: ${qty} ${product.um}`, '', { duration: 1000, panelClass: ['snack-success'] });
    }
    // pending qty rămâne — nu se resetează
  }

  updateQty(product: Product, val: string): void {
    const qty = Math.max(1, parseInt(val) || 1);
    const key = this.pkey(product);
    this.cart.update(c => c.map(i => this.pkey(i.product) === key ? { ...i, qty } : i));
  }

  incrementQty(product: Product): void {
    const key = this.pkey(product);
    this.cart.update(c => c.map(i => this.pkey(i.product) === key ? { ...i, qty: i.qty + 1 } : i));
  }

  decrementQty(product: Product): void {
    const key  = this.pkey(product);
    const item = this.cart().find(i => this.pkey(i.product) === key);
    if (!item) return;
    if (item.qty <= 1) { this.confirmDeleteKey.set(key); return; }
    this.cart.update(c => c.map(i => this.pkey(i.product) === key ? { ...i, qty: i.qty - 1 } : i));
  }

  confirmRemove(product: Product): void {
    this.confirmDeleteKey.set(this.pkey(product));
  }

  doRemove(product: Product): void {
    const key = this.pkey(product);
    this.cart.update(c => c.filter(i => this.pkey(i.product) !== key));
    this.confirmDeleteKey.set(null);
  }

  cancelRemove(): void { this.confirmDeleteKey.set(null); }

  clearCart(): void {
    if (confirm('Ștergi toate produsele din coș?')) this.cart.set([]);
  }

  /* ── Submit ── */
  submit(): void {
    this.nameCtrl.markAsTouched();
    if (this.nameCtrl.invalid) {
      this.snackBar.open('Introduceți numele clientului.', '', { duration: 2500, panelClass: ['snack-warn'] });
      return;
    }
    if (this.cart().length === 0) {
      this.snackBar.open('Adaugă cel puțin un produs în coș.', '', { duration: 2500, panelClass: ['snack-warn'] });
      return;
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
      helper: (this.helperCtrl.value || '').trim() || undefined,
      products: this.cart().map(i => ({
        nr:        i.product.nr,
        name:      i.product.name,
        um:        i.product.um,
        qty:       i.qty,
        category:  i.product.category,
        catalogId: i.product.catalogId,
        furnizor:  i.product.furnizor,
        codExtern: i.product.codExtern,
      } as OrderProduct)),
      status: 'trimis'
    };

    this.ordersService.saveOrder(order);
    this.lastOrderText = this.ordersService.generateText(order);
    this.lastOrder = order;

    const mailto = this.ordersService.generateMailto(order, this.lastOrderText);
    window.open(mailto, '_blank');

    this.cart.set([]);
    this.nameCtrl.reset();
    this.phoneCtrl.reset();
    this.addressCtrl.reset();
    this.helperCtrl.reset();
    this.noteCtrl.reset();
    this.submitted = true;

    this.snackBar.open('Comanda a fost salvată!', 'OK', { duration: 4000, panelClass: ['snack-success'] });
  }

  copyText(): void {
    if (!this.lastOrderText) return;
    navigator.clipboard.writeText(this.lastOrderText)
      .then(() => this.snackBar.open('Textul a fost copiat!', '', { duration: 2000, panelClass: ['snack-success'] }))
      .catch(() => this._fallbackCopy(this.lastOrderText));
  }

  private _fallbackCopy(text: string): void {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    this.snackBar.open('Copiat!', '', { duration: 2000 });
  }

  resendEmail(): void {
    if (!this.lastOrder) return;
    window.open(this.ordersService.generateMailto(this.lastOrder, this.lastOrderText), '_blank');
  }

  newOrder(): void {
    this.submitted = false;
    this.lastOrder = null;
    this.lastOrderText = '';
    this.showCart.set(false);
  }
}
