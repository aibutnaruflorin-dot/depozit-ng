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

interface StatusEntry {
  key: string;
  label: string;
  desc: string;
}

@Component({
  selector: 'app-mobile-manual',
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule, MobileNavComponent],
  templateUrl: './mobile-manual.component.html',
  styleUrl: './mobile-manual.component.scss'
})
export class MobileManualComponent {

  orderStatuses: StatusEntry[] = [
    { key: 'trimis',         label: 'Trimis',         desc: 'Comanda trimisă — în așteptare la admin.' },
    { key: 'acceptat',       label: 'Acceptată',       desc: 'Admin a confirmat comanda.' },
    { key: 'planificat',     label: 'Planificat',      desc: 'Inclus într-o cursă de transport.' },
    { key: 'in-livrare',     label: 'În livrare',      desc: 'Șoferul este pe drum.' },
    { key: 'livrat-partial', label: 'Livrat parțial',  desc: 'O parte livrată; restul în așteptare.' },
    { key: 'livrat',         label: 'Livrat',          desc: 'Toate produsele au ajuns la client.' },
    { key: 'finalizat',      label: 'Finalizat',       desc: 'Procesat complet, cu ajustări confirmate.' },
    { key: 'anulat',         label: 'Anulat',          desc: 'Comanda a fost anulată de admin.' },
  ];

  transportStatuses: StatusEntry[] = [
    { key: 'planificat', label: 'Planificat', desc: 'Cursa creată, șoferul nu a pornit.' },
    { key: 'in-livrare', label: 'În livrare', desc: 'Șoferul a pornit cursa.' },
    { key: 'livrat',     label: 'Livrat',     desc: 'Toate comenzile au fost livrate.' },
    { key: 'anulat',     label: 'Anulat',     desc: 'Cursa a fost anulată.' },
  ];

  sections = signal<ManualSection[]>([
    {
      title: 'Flux complet', icon: 'route', open: false,
      content: `
        <ol class="mman-steps">
          <li><strong>Agent</strong> — trimite o comandă nouă</li>
          <li><strong>Admin</strong> — vede comanda, o acceptă sau anulează</li>
          <li><strong>Admin</strong> — creează o cursă de transport (pentru comenzile cu livrare)</li>
          <li><strong>Șofer</strong> — confirmă cursa și pornește</li>
          <li><strong>Șofer</strong> — marchează livrarea ca finalizată</li>
          <li><strong>Admin</strong> — poate ajusta cantitățile finale</li>
          <li><strong>Agent</strong> — vede statusul final în Comenzile mele</li>
        </ol>
      `
    },
    {
      title: 'Catalog', icon: 'inventory_2', open: false,
      content: `
        <p>Afișează toate produsele disponibile cu stoc, preț și locație în depozit.</p>
        <ul class="mman-list">
          <li>Filtrează pe catalog, categorie sau furnizor</li>
          <li>Apasă pe un produs pentru detalii complete</li>
          <li>Butonul <strong>Coș</strong> adaugă produsul direct la o comandă nouă</li>
        </ul>
      `
    },
    {
      title: 'Comandă Nouă', icon: 'shopping_cart', open: false,
      content: `
        <p>Creează o comandă pentru un client.</p>
        <ul class="mman-list">
          <li>Adaugă produse cu <strong>+ / −</strong> sau tastează cantitatea</li>
          <li>Deschide coșul din bara de total de jos</li>
          <li>Completează: client, localitate, telefon, data dorită</li>
          <li>Bifează <strong>Cu livrare</strong> dacă produsele se livrează la domiciliu</li>
          <li>Apasă <strong>Trimite</strong> — comanda ajunge la administrator</li>
        </ul>
      `
    },
    {
      title: 'Comenzile Mele', icon: 'receipt_long', open: false,
      content: `
        <p>Lista tuturor comenzilor tale, cu statusul curent.</p>
        <ul class="mman-list">
          <li>Filtrează după status sau dată</li>
          <li>Apasă pe o comandă pentru detalii și produse</li>
          <li>Comenzile <span class="mman-chip s-trimis">Trimis</span> sunt în așteptare la admin</li>
          <li>Comenzile <span class="mman-chip s-livrat">Livrat</span> au ajuns la client</li>
        </ul>
      `
    },
    {
      title: 'Transport (Admin)', icon: 'add_road', open: false,
      content: `
        <p>Secțiune disponibilă pentru <strong>administratori</strong>.</p>
        <ul class="mman-list">
          <li>Afișează toate cursele de transport</li>
          <li>Apasă <strong>+</strong> pentru a crea o cursă nouă</li>
          <li>Alege vehiculul, șoferul și datele de plecare/sosire</li>
          <li>Adaugă comenzile cu livrare care trebuie transportate</li>
          <li>Poți edita sau anula o cursă oricând înainte de pornire</li>
        </ul>
      `
    },
    {
      title: 'Cursele Mele (Șofer)', icon: 'directions_car', open: false,
      content: `
        <p>Secțiune disponibilă pentru <strong>șoferi</strong>.</p>
        <ul class="mman-list">
          <li>Afișează cursele tale programate și active</li>
          <li><strong>Confirmă</strong> — ai luat la cunoștință de cursă</li>
          <li><strong>Pornit</strong> — marchezi că ai plecat cu marfa</li>
          <li>Poți ajusta cantitățile livrate dacă livrezi parțial</li>
          <li><strong>Livrat</strong> — marchezi finalizarea livrării</li>
        </ul>
        <p style="margin-top:0.5rem">Statusul cursei: <span class="mman-chip s-planificat">Planificat</span> → <span class="mman-chip s-in-livrare">În livrare</span> → <span class="mman-chip s-livrat">Livrat</span></p>
      `
    },
    {
      title: 'Contul Meu', icon: 'person', open: false,
      content: `
        <ul class="mman-list">
          <li>Vizualizează profilul și rolul tău în aplicație</li>
          <li>Schimbă parola — minim 8 caractere, o literă mare, o cifră</li>
          <li>Deconectare din aplicație</li>
        </ul>
      `
    },
  ]);

  toggle(i: number): void {
    this.sections.update(s => s.map((sec, idx) => idx === i ? { ...sec, open: !sec.open } : sec));
  }
}
