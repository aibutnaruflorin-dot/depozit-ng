import { Component, computed, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CatalogsService } from '../../core/services/catalogs.service';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterModule } from '@angular/router';
import { PaginatorModule } from 'primeng/paginator';
import { TableModule } from 'primeng/table';

@Component({
  selector: 'app-catalog',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatButtonModule, MatIconModule, MatCheckboxModule, MatDividerModule,
    MatTooltipModule, RouterModule,
    PaginatorModule, TableModule
  ],
  templateUrl: './catalog.component.html',
  styleUrl:    './catalog.component.scss'
})
export class CatalogComponent implements OnInit {
  readonly PAGE_SIZE = 48;

  search               = signal('');
  category             = signal('');
  codExternFilter      = signal('');
  furnizorFilter       = signal<string[]>([]);
  furnizorDropdownOpen = signal(false);
  furnizorSearch       = signal('');
  categoryDropdownOpen = signal(false);
  categorySearch       = signal('');
  currentPage          = signal(0);
  selectedCatIds       = signal<string[]>([]);
  displayMode          = signal<'mixed' | 'grouped'>('mixed');
  sortField            = signal('');
  sortOrder            = signal<1 | -1>(1);

  constructor(public catalogsService: CatalogsService, private router: Router) {}

  ngOnInit(): void {}

  readonly allSelected = computed(() => this.selectedCatIds().length === 0);

  readonly categories = computed(() => this.catalogsService.categoriesFor(this.selectedCatIds()));

  readonly furnizors = computed(() => this.catalogsService.furnizorsFor(this.selectedCatIds()));

  readonly filteredFurnizors = computed(() => {
    const s = this.furnizorSearch().toLowerCase().trim();
    return s ? this.furnizors().filter(f => f.toLowerCase().includes(s)) : this.furnizors();
  });

  readonly filteredCategories = computed(() => {
    const s = this.categorySearch().toLowerCase().trim();
    return s ? this.categories().filter(c => c.toLowerCase().includes(s)) : this.categories();
  });

  readonly allFurnizorsSelected = computed(() =>
    this.furnizors().length > 0 && this.furnizorFilter().length === this.furnizors().length
  );

  readonly filtered = computed(() => {
    const q         = this.search().toLowerCase();
    const cat       = this.category();
    const codExtern = this.codExternFilter().trim().toLowerCase();
    const furnizors = this.furnizorFilter();
    const mode      = this.displayMode();
    const field     = this.sortField();
    const order     = this.sortOrder();

    const base = mode === 'grouped'
      ? this.catalogsService.productsForGrouped(this.selectedCatIds())
      : this.catalogsService.productsFor(this.selectedCatIds());

    const result = base.filter(p => {
      const matchQ        = !q                    || p.name.toLowerCase().includes(q) || String(p.nr).includes(q);
      const matchCat      = !cat                  || p.category === cat;
      const matchCodExt   = !codExtern            || (p.codExtern ?? '').toLowerCase().includes(codExtern);
      const matchFurnizor = furnizors.length === 0 || furnizors.includes(p.furnizor ?? '');
      return matchQ && matchCat && matchCodExt && matchFurnizor;
    });

    if (!field) return result;

    const cmp = (a: any, b: any) => {
      let av = a[field] ?? '';
      let bv = b[field] ?? '';
      if (typeof av === 'string') av = av.toLowerCase();
      if (typeof bv === 'string') bv = bv.toLowerCase();
      return av < bv ? -order : av > bv ? order : 0;
    };

    if (mode === 'grouped') {
      const groups = new Map<string, any[]>();
      const groupOrder: string[] = [];
      for (const p of result) {
        if (!groups.has(p.catalogId)) { groups.set(p.catalogId, []); groupOrder.push(p.catalogId); }
        groups.get(p.catalogId)!.push(p);
      }
      const out: any[] = [];
      for (const id of groupOrder) out.push(...groups.get(id)!.sort(cmp));
      return out;
    }

    return [...result].sort(cmp);
  });

  readonly paged = computed(() => {
    const start = this.currentPage() * this.PAGE_SIZE;
    return this.filtered().slice(start, start + this.PAGE_SIZE);
  });

  toggleDisplayMode(): void { this.displayMode.update(m => m === 'mixed' ? 'grouped' : 'mixed'); this.currentPage.set(0); }

  sort(field: string): void {
    if (this.sortField() === field) { this.sortOrder.update(o => o === 1 ? -1 : 1); }
    else { this.sortField.set(field); this.sortOrder.set(1); }
    this.currentPage.set(0);
  }
  sortIcon(field: string): string {
    if (this.sortField() !== field) return 'unfold_more';
    return this.sortOrder() === 1 ? 'arrow_upward' : 'arrow_downward';
  }

  onSearch(val: string):   void { this.search.set(val);   this.currentPage.set(0); }
  onCategory(val: string): void { this.category.set(val); this.currentPage.set(0); }
  onPageChange(e: any):    void { this.currentPage.set(e.page); }

  clearFilters(): void {
    this.search.set('');
    this.category.set('');
    this.codExternFilter.set('');
    this.furnizorFilter.set([]);
    this.furnizorSearch.set('');
    this.categorySearch.set('');
    this.currentPage.set(0);
  }

  toggleCatalog(id: string): void {
    this.selectedCatIds.update(ids =>
      ids.includes(id) ? ids.filter(i => i !== id) : [...ids, id]
    );
    this.category.set('');
    this.furnizorFilter.set([]);
    this.furnizorSearch.set('');
    this.categorySearch.set('');
    this.currentPage.set(0);
  }

  toggleFurnizorDropdown(): void  { this.furnizorDropdownOpen.update(v => !v); this.categoryDropdownOpen.set(false); }
  closeFurnizorDropdown(): void   { this.furnizorDropdownOpen.set(false); this.furnizorSearch.set(''); }
  toggleFurnizorItem(f: string): void {
    this.furnizorFilter.update(arr => arr.includes(f) ? arr.filter(x => x !== f) : [...arr, f]);
    this.currentPage.set(0);
  }
  toggleAllFurnizors(): void {
    this.furnizorFilter.set(this.allFurnizorsSelected() ? [] : [...this.furnizors()]);
    this.currentPage.set(0);
  }

  toggleCategoryDropdown(): void  { this.categoryDropdownOpen.update(v => !v); this.furnizorDropdownOpen.set(false); }
  closeCategoryDropdown(): void   { this.categoryDropdownOpen.set(false); this.categorySearch.set(''); }
  selectCategory(c: string): void { this.onCategory(c); this.closeCategoryDropdown(); }

  rowBg(catalogId: string): string    { return this.catalogsService.bgColor(catalogId, 0.08); }
  rowBorder(catalogId: string): string { return this.catalogsService.borderColor(catalogId); }
  goToNewOrder(): void                 { this.router.navigate(['/app/new-order']); }
}
