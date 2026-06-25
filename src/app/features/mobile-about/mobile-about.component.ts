import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MobileNavComponent } from '../../shared/mobile-nav/mobile-nav.component';

@Component({
  selector: 'app-mobile-about',
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule, MobileNavComponent],
  templateUrl: './mobile-about.component.html',
  styleUrl: './mobile-about.component.scss'
})
export class MobileAboutComponent {
  readonly version = '1.0.0';
  readonly year    = new Date().getFullYear();
}
