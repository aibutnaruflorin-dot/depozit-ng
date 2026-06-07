import { Component, input, output, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { OrdersService, generateId } from '../../core/services/orders.service';
import { CatalogsService } from '../../core/services/catalogs.service';
import { AuthService } from '../../core/services/auth.service';
import { Order, OrderProduct, OrderEvent } from '../../core/models/order.model';
import { Product } from '../../core/models/product.model';

const SOURCE_LABELS: Record<string, string> = {
  'transport': 'Transport',
  'comenzile-mele': 'Comenzile mele',
  'toate-comenzile': 'Toate comenzile',
};

@Component({
  selector: 'app-add-products-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, MatButtonModule, MatTooltipModule, MatSnackBarModule],
  templateUrl: './add-products-modal.component.html',
  styleUrl: './add-products-modal.component.scss'
})
export class AddProductsModalComponent {
  readonly order  = input.required<Order>();
  readonly source = input.required<'transport' | 'comenzile-mele' | 'toate-comenzile'>();
  readonly closed = output<void>();

  searchQ          = signal('');
  selectedCatalogId = signal<string | null>(null);
  staged           = signal<OrderProduct[]>([]);
  manualName       = signal('');
  manualQty        = signal(1);
  manualUm         = signal('BUC');
  manualPret       = signal<number | null>(null);
  showJournal      = signal(false);

  readonly sourceLabel = (s: string) => SOURCE_LABELS[s] ?? s;

  readonly catalogs = computed(() => this.catalogsService.catalogs());

  readonly filteredProducts = computed(() => {
    const q   = this.searchQ().toLowerCase().trim();
    const cat = this.selectedCatalogId();
    const pool = cat
      ? this.catalogsService.allProducts().filter(p => p.catalogId === cat)
      : this.catalogsService.allProducts();
    if (!q) return pool.slice(0, 40);
    return pool.filter(p => p.name.toLowerCase().includes(q)).slice(0, 40);
  });

  constructor(
    private ordersService: OrdersService,
    private catalogsService: CatalogsService,
    private auth: AuthService,
    private snackBar: MatSnackBar
  ) {}

  addFromCatalog(p: Product): void {
    const idx = this.staged().findIndex(s => s.name === p.name);
    if (idx >= 0) {
      this.staged.update(list => list.map((s, i) => i === idx ? { ...s, qty: s.qty + 1 } : s));
    } else {
      const product: OrderProduct = {
        nr: p.nr, name: p.name, um: p.um, qty: 1, category: p.category,
        catalogId: p.catalogId, furnizor: p.furnizor, codExtern: p.codExtern,
        pretFaraTVA: p.pretFaraTVA, pretCuTVA: p.pretCuTVA,
      };
      this.staged.update(list => [...list, product]);
    }
    this.searchQ.set('');
  }

  addManual(): void {
    const name = this.manualName().trim();
    if (!name) { this.snackBar.open('Introdu numele produsului.', '', { duration: 2000 }); return; }
    const pret = this.manualPret();
    const product: OrderProduct = {
      nr: `m-${Date.now()}`, name,
      um: this.manualUm().trim() || 'BUC',
      qty: Math.max(1, this.manualQty()),
      category: 'DIVERSE',
      ...(pret != null && pret > 0 ? { pretFaraTVA: pret, pretCuTVA: Math.round(pret * 1.19 * 100) / 100 } : {}),
    };
    this.staged.update(list => [...list, product]);
    this.manualName.set('');
    this.manualQty.set(1);
    this.manualPret.set(null);
  }

  setStagedQty(idx: number, val: string | number): void {
    const qty = Math.max(1, parseInt(String(val)) || 1);
    this.staged.update(list => list.map((s, i) => i === idx ? { ...s, qty } : s));
  }

  onPretKeydown(e: KeyboardEvent): void {
    const allowed = ['Backspace','Delete','ArrowLeft','ArrowRight','Tab','Home','End'];
    if (!allowed.includes(e.key) && (e.key < '0' || e.key > '9')) e.preventDefault();
  }

  removeStaged(idx: number): void {
    this.staged.update(list => list.filter((_, i) => i !== idx));
  }

  confirm(): void {
    const products = this.staged();
    if (!products.length) { this.snackBar.open('Adaugă cel puțin un produs.', '', { duration: 2000 }); return; }
    const session = this.auth.session();
    const event: Omit<OrderEvent, 'id'> = {
      timestamp: new Date().toISOString(),
      userId: session?.userId ?? 0,
      userName: session?.name ?? '—',
      source: this.source(),
      type: 'products_added',
      products: products.map(p => ({ name: p.name, qty: p.qty, um: p.um })),
    };
    this.ordersService.addProductsToOrder(this.order().id, products, event);
    this.snackBar.open(`${products.length} produs(e) adăugate la comanda #${this.order().orderNumber}.`, '', { duration: 3000 });
    this.closed.emit();
  }
}
