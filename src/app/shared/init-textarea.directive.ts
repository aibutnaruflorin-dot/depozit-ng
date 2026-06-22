import { Directive, ElementRef, Input, OnInit } from '@angular/core';

@Directive({ selector: '[appInitValue]', standalone: true })
export class InitValueDirective implements OnInit {
  @Input() appInitValue = '';
  constructor(private el: ElementRef<HTMLTextAreaElement>) {}
  ngOnInit(): void {
    this.el.nativeElement.value = this.appInitValue;
  }
}
