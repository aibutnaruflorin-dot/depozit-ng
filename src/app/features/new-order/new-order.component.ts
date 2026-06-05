import { Component, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ProductsService } from '../../core/services/products.service';
import { OrdersService, generateId } from '../../core/services/orders.service';
import { Product } from '../../core/models/product.model';
import { Order, OrderProduct } from '../../core/models/order.model';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatChipsModule } from '@angular/material/chips';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatExpansionModule } from '@angular/material/expansion';
import { RouterModule } from '@angular/router';

export interface CartItem {
  product: Product;
  qty: number;
}

@Component({
  selector: 'app-new-order',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, FormsModule,
    MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule,
    MatCardModule, MatDividerModule, MatChipsModule, MatAutocompleteModule,
    MatSelectModule, MatSnackBarModule, MatDialogModule, MatTooltipModule, MatExpansionModule, RouterModule
  ],
  templateUrl: './new-order.component.html',
  styleUrl:    './new-order.component.scss'
})
export class NewOrderComponent implements OnInit {
  clientForm: FormGroup;
  searchQuery = '';
  categoryFilter = signal('');
  cart = signal<CartItem[]>([]);
  submitting = false;
  submitted = false;
  lastOrder: Order | null = null;
  lastOrderText = '';

  constructor(
    private fb: FormBuilder,
    private auth: AuthService,
    public productsService: ProductsService,
    private ordersService: OrdersService,
    private snackBar: MatSnackBar,
    private router: Router
  ) {
    this.clientForm = this.fb.group({
      name:  ['', Validators.required],
      phone: ['', [Validators.required, Validators.pattern(/^[0-9+\s\-()]{7,20}$/)]],
      email: ['', [Validators.email]],
      note:  ['']
    });
  }

  ngOnInit(): void {}

  readonly categories = computed(() => this.productsService.categories());

  readonly suggestions = computed(() => {
    const q   = this.searchQuery.trim().toLowerCase();
    const cat = this.categoryFilter();
    if (!q && !cat) return [];
    return this.productsService.products()
      .filter(p => {
        const matchQ   = !q   || p.name.toLowerCase().includes(q) || String(p.nr).includes(q);
        const matchCat = !cat || p.category === cat;
        return matchQ && matchCat && !this.isInCart(p.nr);
      })
      .slice(0, 40);
  });

  isInCart(nr: number | string): boolean {
    return this.cart().some(i => i.product.nr === nr);
  }

  addProduct(product: Product): void {
    if (this.isInCart(product.nr)) {
      this.snackBar.open(`${product.name.slice(0, 40)} este deja în comandă.`, '', { duration: 2000 });
      return;
    }
    this.cart.update(c => [...c, { product, qty: 1 }]);
    this.searchQuery = '';
    this.snackBar.open(`✓ ${product.name.slice(0, 40)} adăugat.`, '', {
      duration: 2000,
      panelClass: ['snack-success']
    });
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
    if (confirm('Ștergi toate produsele din comandă?')) {
      this.cart.set([]);
    }
  }

  canSubmit(): boolean {
    return this.clientForm.valid && this.cart().length > 0;
  }

  submit(): void {
    if (this.clientForm.invalid) { this.clientForm.markAllAsTouched(); return; }
    if (this.cart().length === 0) {
      this.snackBar.open('Adaugă cel puțin un produs în comandă.', '', { duration: 3000, panelClass: ['snack-warn'] });
      return;
    }

    const session = this.auth.session();
    if (!session) { this.auth.logout(); return; }
    const { name, phone, email, note } = this.clientForm.value;

    const order: Order = {
      id:        generateId(),
      timestamp: new Date().toISOString(),
      agent:     { id: session.userId, name: session.name, username: session.username },
      client:    { name: name.trim(), phone: phone.trim(), email: email?.trim() || '', note: note?.trim() || '' },
      products:  this.cart().map(i => ({
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

    // Open mailto
    const mailto = this.ordersService.generateMailto(order, this.lastOrderText);
    window.open(mailto, '_blank');

    // Reset
    this.cart.set([]);
    this.clientForm.reset();
    this.submitted = true;

    this.snackBar.open('✅ Comanda a fost salvată și emailul pregătit!', 'OK', {
      duration: 5000,
      panelClass: ['snack-success']
    });
  }

  copyText(): void {
    if (!this.lastOrderText) return;
    navigator.clipboard.writeText(this.lastOrderText).then(() => {
      this.snackBar.open('📋 Textul a fost copiat!', '', { duration: 2000, panelClass: ['snack-success'] });
    }).catch(() => {
      this.fallbackCopy(this.lastOrderText);
    });
  }

  private fallbackCopy(text: string): void {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    this.snackBar.open('📋 Copiat!', '', { duration: 2000 });
  }

  resendEmail(): void {
    if (!this.lastOrder) return;
    const mailto = this.ordersService.generateMailto(this.lastOrder, this.lastOrderText);
    window.open(mailto, '_blank');
  }

  newOrder(): void {
    this.submitted = false;
    this.lastOrder = null;
    this.lastOrderText = '';
  }

  displayFn(product: Product): string {
    return product?.name ?? '';
  }
}
