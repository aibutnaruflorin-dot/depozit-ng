import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MobileNavComponent } from '../../shared/mobile-nav/mobile-nav.component';

@Component({
  selector: 'app-mobile-about',
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule, MatDividerModule, MobileNavComponent],
  templateUrl: './mobile-about.component.html',
  styleUrl: './mobile-about.component.scss'
})
export class MobileAboutComponent {
  readonly year = 2026;
  readonly app  = { name: 'D2C', subtitle: 'Gestiune Comenzi' };

  readonly author = {
    name:     'Florin Butnaru',
    company:  'Lean Digital',
    linkedin: 'https://www.linkedin.com/company/leandigital-ro/',
    phone:    '0763027577',
    emails:   ['hello.leandigital@gmail.com', 'butnaru.florin@gmail.com']
  };
}
