import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';

@Component({
  selector: 'app-about',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatDividerModule],
  templateUrl: './about.component.html',
  styleUrl: './about.component.scss'
})
export class AboutComponent {
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
