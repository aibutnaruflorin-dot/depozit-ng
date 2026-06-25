import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MobileNavComponent } from '../../shared/mobile-nav/mobile-nav.component';

interface ManualSection {
  title: string;
  icon: string;
  content: string;
  open: boolean;
}

@Component({
  selector: 'app-mobile-manual',
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule, MobileNavComponent],
  templateUrl: './mobile-manual.component.html',
  styleUrl: './mobile-manual.component.scss'
})
export class MobileManualComponent {
  sections = signal<ManualSection[]>([
    {
      title: 'Catalog', icon: 'inventory_2', open: false,
      content: 'Catalogul afișează produsele disponibile cu stoc, preț și locație. Apasă pe butonul coș de lângă un produs pentru a-l adăuga la o comandă nouă.'
    },
    {
      title: 'Comandă Nouă', icon: 'shopping_cart', open: false,
      content: 'Adaugă produse cu butoanele + / −. Apasă pe bara de total pentru a deschide coșul și a completa datele clientului. Salvează comanda — aceasta va fi ciornă și o poți trimite din Comenzile mele.'
    },
    {
      title: 'Comenzile Mele', icon: 'receipt_long', open: false,
      content: 'Aici găsești toate comenzile tale. Filtrează după status. Apasă pe o comandă pentru detalii. Din starea Ciornă poți trimite comanda sau o poți anula.'
    },
    {
      title: 'Transport', icon: 'local_shipping', open: false,
      content: 'Vizualizează cursele de transport active și livrate. Fiecare cursă afișează vehiculul, șoferul, orele și comenzile asociate.'
    },
    {
      title: 'Cursele Mele', icon: 'directions_car', open: false,
      content: 'Disponibil pentru șoferi. Afișează cursele tale actuale cu bara de progres. Confirmă, pornește și finalizează livrările direct de pe telefon.'
    },
    {
      title: 'Contul Meu', icon: 'person', open: false,
      content: 'Vizualizează profilul tău și schimbă parola. Folosește o parolă puternică cu minim 8 caractere, o literă mare și o cifră.'
    },
  ]);

  toggle(i: number): void {
    this.sections.update(s => s.map((sec, idx) => idx === i ? { ...sec, open: !sec.open } : sec));
  }
}
