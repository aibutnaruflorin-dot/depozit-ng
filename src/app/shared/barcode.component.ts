import { Component, Input, AfterViewInit, ViewChild, ElementRef, OnChanges } from '@angular/core';
import JsBarcode from 'jsbarcode';

@Component({
  selector: 'app-barcode',
  standalone: true,
  template: `<svg #barcodeEl></svg>`,
  styles: [`
    :host { display: block; }
    svg { max-width: 100%; height: auto; }
  `]
})
export class BarcodeComponent implements AfterViewInit, OnChanges {
  @Input() value = '';
  @ViewChild('barcodeEl') barcodeEl!: ElementRef<SVGSVGElement>;

  private _rendered = false;

  ngAfterViewInit(): void {
    this._render();
    this._rendered = true;
  }

  ngOnChanges(): void {
    if (this._rendered) this._render();
  }

  private _render(): void {
    if (!this.value || !this.barcodeEl) return;
    try {
      JsBarcode(this.barcodeEl.nativeElement, this.value, {
        format:       'CODE128',
        width:        1.4,
        height:       36,
        displayValue: true,
        fontSize:     10,
        margin:       4,
        lineColor:    '#333'
      });
    } catch {
      // valoare incompatibilă cu CODE128 — nu randăm nimic
    }
  }
}
