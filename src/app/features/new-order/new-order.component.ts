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
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';

export interface CartItem { product: Product; qty: number; }

// Cantități pending pentru fiecare produs din listă (înainte de adăugare)
type NrKey = string | number;

@Component({
  selector: 'app-new-order',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, FormsModule,
    MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule,
    MatDividerModule, MatSelectModule, MatSnackBarModule, MatTooltipModule
  ],
  templateUrl: './new-order.component.html',
  styleUrl:    './new-order.component.scss'
})
export class NewOrderComponent implements OnInit {
  /* ── form controls ── */
  nameCtrl  = new FormControl('', Validators.required);
  phoneCtrl = new FormControl('');
  noteCtrl  = new FormControl('');

  /* ── search / cart state ── */
  searchQuery      = '';
  categoryFilter   = signal('');
  selectedCatIds   = signal<string[]>([]);   // empty = all
  cart             = signal<CartItem[]>([]);
  showCart         = signal(false);

  private _pendingQty = signal<Record<string, number>>({});

  /* ── submit state ── */
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

  readonly allCatSelected = computed(() => this.selectedCatIds().length === 0);
  readonly categories     = computed(() => this.catalogsService.categoriesFor(this.selectedCatIds()));
  displayMode = signal<'mixed' | 'grouped'>('mixed');

  toggleCatalog(id: string): void {
    this.selectedCatIds.update(ids =>
      ids.includes(id) ? ids.filter(i => i !== id) : [...ids, id]
    );
    this.categoryFilter.set('');
  }

  toggleDisplayMode(): void {
    this.displayMode.update(m => m === 'mixed' ? 'grouped' : 'mixed');
  }

  readonly suggestions = computed(() => {
    const q    = this.searchQuery.trim().toLowerCase();
    const cat  = this.categoryFilter();
    const mode = this.displayMode();
    if (!q && !cat && this.selectedCatIds().length === 0) return [];
    const base = mode === 'grouped'
      ? this.catalogsService.productsForGrouped(this.selectedCatIds())
      : this.catalogsService.productsFor(this.selectedCatIds());
    return base.filter(p => {
      const matchQ   = !q   || p.name.toLowerCase().includes(q) || String(p.nr).includes(q);
      const matchCat = !cat || p.category === cat;
      return matchQ && matchCat;
    }).slice(0, 80);
  });

  rowBg(catalogId: string): string { return this.catalogsService.bgColor(catalogId, 0.08); }
  rowBorder(catalogId: string): string { return this.catalogsService.borderColor(catalogId); }

  /* ── pending qty helpers (în rândul din listă) ── */
  getPendingQty(nr: NrKey): number {
    return this._pendingQty()[String(nr)] ?? 1;
  }
  setPendingQty(nr: NrKey, val: string | number): void {
    const qty = Math.max(1, parseInt(String(val)) || 1);
    this._pendingQty.update(m => ({ ...m, [String(nr)]: qty }));
  }
  incPending(nr: NrKey): void { this.setPendingQty(nr, this.getPendingQty(nr) + 1); }
  decPending(nr: NrKey): void { this.setPendingQty(nr, this.getPendingQty(nr) - 1); }

  /* ── cart helpers ── */
  isInCart(nr: number | string): boolean {
    return this.cart().some(i => i.product.nr === nr);
  }

  openCart():  void { this.showCart.set(true); }
  closeCart(): void { this.showCart.set(false); }

  addProduct(product: Product): void {
    const qty = this.getPendingQty(product.nr);
    if (this.isInCart(product.nr)) {
      // dacă e deja în coș, actualizează cantitatea
      this.cart.update(c => c.map(i => i.product.nr === product.nr ? { ...i, qty } : i));
      this.snackBar.open(`✓ Cantitate actualizată: ${qty} ${product.um}`, '', {
        duration: 1500, panelClass: ['snack-success']
      });
    } else {
      this.cart.update(c => [...c, { product, qty }]);
      this.snackBar.open(`✓ ${product.name.slice(0, 40)} adăugat (${qty} ${product.um}).`, '', {
        duration: 1500, panelClass: ['snack-success']
      });
    }
    this._pendingQty.update(m => { const n = {...m}; delete n[String(product.nr)]; return n; });
  }

  updateQty(nr: number | string, val: string): void {
    const qty = Math.max(1, parseInt(val) || 1);
    this.cart.update(c => c.map(i => i.product.nr === nr ? { ...i, qty } : i));
  }

  incrementQty(nr: number | string): void {
    this.cart.update(c => c.map(i => i.product.nr === nr ? { ...i, qty: i.qty + 1 } : i));
  }

  decrementQty(nr: number | string): void {
    this.cart.update(c => c.map(i => i.product.nr === nr ? { ...i, qty: Math.max(1, i.qty - 1) } : i));
  }

  removeProduct(nr: number | string): void {
    this.cart.update(c => c.filter(i => i.product.nr !== nr));
  }

  clearCart(): void {
    if (confirm('Ștergi toate produsele din coș?')) this.cart.set([]);
  }

  /* ── submit ── */
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
        name:  (this.nameCtrl.value || '').trim(),
        phone: (this.phoneCtrl.value || '').trim(),
        email: '',
        note:  (this.noteCtrl.value || '').trim()
      },
      products: this.cart().map(i => ({
        nr:       i.product.nr,
        name:     i.product.name,
        um:       i.product.um,
        qty:      i.qty,
        category: i.product.category
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
    this.noteCtrl.reset();
    this.submitted = true;

    this.snackBar.open('✅ Comanda a fost salvată!', 'OK', {
      duration: 4000, panelClass: ['snack-success']
    });
  }

  copyText(): void {
    if (!this.lastOrderText) return;
    navigator.clipboard.writeText(this.lastOrderText).then(() => {
      this.snackBar.open('📋 Textul a fost copiat!', '', { duration: 2000, panelClass: ['snack-success'] });
    }).catch(() => this._fallbackCopy(this.lastOrderText));
  }

  private _fallbackCopy(text: string): void {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    this.snackBar.open('📋 Copiat!', '', { duration: 2000 });
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
