import { Directive, ElementRef, OnInit, OnDestroy } from '@angular/core';

@Directive({ selector: '[appDragModal]', standalone: true })
export class DragModalDirective implements OnInit, OnDestroy {
  private _handle: HTMLElement | null = null;
  private _dragging = false;
  private _originX = 0;
  private _originY = 0;
  private _tx = 0;
  private _ty = 0;

  constructor(private el: ElementRef<HTMLElement>) {}

  ngOnInit(): void {
    this._handle = this.el.nativeElement.querySelector(
      'mat-card-header, .mat-mdc-card-header'
    );
    if (this._handle) {
      this._handle.style.cursor = 'grab';
      this._handle.style.userSelect = 'none';
      this._handle.addEventListener('mousedown', this._onDown);
    }
  }

  ngOnDestroy(): void {
    this._handle?.removeEventListener('mousedown', this._onDown);
    document.removeEventListener('mousemove', this._onMove);
    document.removeEventListener('mouseup', this._onUp);
  }

  private _onDown = (e: MouseEvent): void => {
    if ((e.target as HTMLElement).closest('button, a, input')) return;
    this._dragging = true;
    this._originX = e.clientX - this._tx;
    this._originY = e.clientY - this._ty;
    if (this._handle) this._handle.style.cursor = 'grabbing';
    document.addEventListener('mousemove', this._onMove);
    document.addEventListener('mouseup', this._onUp);
    e.preventDefault();
  };

  private _onMove = (e: MouseEvent): void => {
    if (!this._dragging) return;
    this._tx = e.clientX - this._originX;
    this._ty = e.clientY - this._originY;
    this.el.nativeElement.style.transform = `translate(${this._tx}px, ${this._ty}px)`;
  };

  private _onUp = (): void => {
    this._dragging = false;
    if (this._handle) this._handle.style.cursor = 'grab';
    document.removeEventListener('mousemove', this._onMove);
    document.removeEventListener('mouseup', this._onUp);
  };
}
