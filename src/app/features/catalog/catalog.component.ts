import { Component, computed, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CatalogsService } from '../../core/services/catalogs.service';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatCardModule } from '@angular/material/card';
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
    MatChipsModule, MatCardModule, MatSelectModule, MatTooltipModule, RouterModule,
    PaginatorModule
  ],
  templateUrl: './catalog.component.html',
  styleUrl:    './catalog.component.scss'
})
export class CatalogComponent implements OnInit {
  readonly PAGE_SIZE = 48;

  search          = signal('');
  category        = signal('');
  currentPage     = signal(0);
  selectedCatIds  = signal<string[]>([]);   // empty = all catalogs

  constructor(public catalogsService: CatalogsService, private router: Router) {}

  ngOnInit(): void {}

  // All catalog IDs selected (or empty = all)
  readonly allSelected = computed(() => this.selectedCatIds().length === 0);

  readonly categories = computed(() => this.catalogsService.categoriesFor(this.selectedCatIds()));

  readonly filtered = computed(() => {
    const q   = this.search().toLowerCase();
    const cat = this.category();
    return this.catalogsService.productsFor(this.selectedCatIds()).filter(p => {
      const matchQ   = !q   || p.name.toLowerCase().includes(q) || String(p.nr).includes(q);
      const matchCat = !cat || p.category === cat;
      return matchQ && matchCat;
    });
  });

  readonly paged = computed(() => {
    const start = this.currentPage() * this.PAGE_SIZE;
    return this.filtered().slice(start, start + this.PAGE_SIZE);
  });

  onSearch(val: string):   void { this.search.set(val);   this.currentPage.set(0); }
  onCategory(val: string): void { this.category.set(val); this.currentPage.set(0); }
  onPageChange(e: any):    void { this.currentPage.set(e.page); }

  clearFilters(): void {
    this.search.set('');
    this.category.set('');
    this.currentPage.set(0);
  }

  toggleCatalog(id: string): void {
    this.selectedCatIds.update(ids =>
      ids.includes(id) ? ids.filter(i => i !== id) : [...ids, id]
    );
    this.category.set('');
    this.currentPage.set(0);
  }

  isCatalogSelected(id: string): boolean {
    return this.selectedCatIds().length === 0 || this.selectedCatIds().includes(id);
  }

  rowBg(catalogId: string): string {
    return this.catalogsService.bgColor(catalogId, 0.08);
  }

  rowBorder(catalogId: string): string {
    return this.catalogsService.borderColor(catalogId);
  }

  goToNewOrder(): void { this.router.navigate(['/app/new-order']); }
}
