import { Component, computed, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ProductsService } from '../../core/services/products.service';
import { Product } from '../../core/models/product.model';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatCardModule } from '@angular/material/card';
import { MatBadgeModule } from '@angular/material/badge';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterModule } from '@angular/router';
import { PaginatorModule } from 'primeng/paginator';

@Component({
  selector: 'app-catalog',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatInputModule, MatFormFieldModule, MatButtonModule, MatIconModule,
    MatChipsModule, MatCardModule, MatBadgeModule, MatSelectModule, MatTooltipModule, RouterModule,
    PaginatorModule
  ],
  templateUrl: './catalog.component.html',
  styleUrl:    './catalog.component.scss'
})
export class CatalogComponent implements OnInit {
  readonly PAGE_SIZE = 48;

  search       = signal('');
  category     = signal('');
  currentPage  = signal(0);
  expandedCard = signal<string | number | null>(null);

  constructor(
    public productsService: ProductsService,
    private router: Router
  ) {}

  ngOnInit(): void {}

  readonly categories = computed(() => this.productsService.categories());
  readonly meta       = computed(() => this.productsService.meta());

  readonly filtered = computed(() => {
    const q    = this.search().toLowerCase();
    const cat  = this.category();
    return this.productsService.products().filter(p => {
      const matchQ   = !q   || p.name.toLowerCase().includes(q) || String(p.nr).includes(q);
      const matchCat = !cat || p.category === cat;
      return matchQ && matchCat;
    });
  });

  readonly paged = computed(() => {
    const start = this.currentPage() * this.PAGE_SIZE;
    return this.filtered().slice(start, start + this.PAGE_SIZE);
  });

  onSearch(val: string):    void { this.search.set(val);    this.currentPage.set(0); }
  onCategory(val: string):  void { this.category.set(val);  this.currentPage.set(0); }
  clearFilters():           void { this.search.set('');     this.category.set(''); this.currentPage.set(0); }
  onPageChange(e: any):     void { this.currentPage.set(e.page); }

  goToNewOrder(): void {
    this.router.navigate(['/app/new-order']);
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleString('ro-RO');
  }
}
