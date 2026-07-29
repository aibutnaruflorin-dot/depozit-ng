import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { StorageService } from '../../core/services/storage.service';
import { CatalogsService } from '../../core/services/catalogs.service';
import { WhatsAppContact } from '../../core/models/whatsapp.model';
import { EmailContact } from '../../core/models/email-contact.model';
import { MobileNavComponent } from '../../shared/mobile-nav/mobile-nav.component';

@Component({
  selector: 'app-m-settings-contacts',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, MatIconModule, MatSnackBarModule, MobileNavComponent],
  templateUrl: './m-settings-contacts.component.html',
  styleUrl: './m-settings-contacts.component.scss'
})
export class MSettingsContactsComponent {
  waContacts    = signal<WhatsAppContact[]>([]);
  emailContacts = signal<EmailContact[]>([]);

  newWaName  = '';
  newWaPhone = '';
  newWaType: 'number' | 'group' = 'number';

  newEmailName = '';
  newEmailAddr = '';
  newEmailType: 'individual' | 'list' = 'individual';

  bufferEmail = '';

  constructor(
    private storage: StorageService,
    public catalogsService: CatalogsService,
    private snackBar: MatSnackBar
  ) {
    this.waContacts.set(this.storage.get<WhatsAppContact[]>('app_whatsapp_contacts') ?? []);
    this.emailContacts.set(this.storage.get<EmailContact[]>('app_email_contacts') ?? []);
    this.bufferEmail = this.catalogsService.bufferNotifyEmail();
  }

  // ── WhatsApp ─────────────────────────────────────────────────────────────

  addWaContact(): void {
    const name = this.newWaName.trim(), phone = this.newWaPhone.trim();
    if (!name || !phone) return;
    if (this.waContacts().some(c => c.phone === phone)) {
      this.snackBar.open('Numărul/link-ul este deja în lista WhatsApp.', '', { duration: 2500 }); return;
    }
    if (this.waContacts().some(c => c.name.toLowerCase() === name.toLowerCase())) {
      this.snackBar.open(`Există deja un contact WhatsApp cu numele "${name}".`, '', { duration: 3000 }); return;
    }
    this.waContacts.update(list => [...list, { id: Date.now().toString(), name, phone, type: this.newWaType }]);
    this._saveWa();
    this.newWaName = ''; this.newWaPhone = '';
    this.snackBar.open('Contact WhatsApp adăugat.', '', { duration: 2000 });
  }

  removeWa(id: string): void {
    this.waContacts.update(list => list.filter(c => c.id !== id));
    this._saveWa();
  }

  private _saveWa(): void { this.storage.set('app_whatsapp_contacts', this.waContacts()); }

  // ── Email ─────────────────────────────────────────────────────────────────

  addEmailContact(): void {
    const name = this.newEmailName.trim(), email = this.newEmailAddr.trim();
    if (!name || !email) return;
    if (this.emailContacts().some(c => c.email === email)) {
      this.snackBar.open('Adresa email este deja în listă.', '', { duration: 2500 }); return;
    }
    if (this.emailContacts().some(c => c.name.toLowerCase() === name.toLowerCase())) {
      this.snackBar.open(`Există deja un contact Email cu numele "${name}".`, '', { duration: 3000 }); return;
    }
    this.emailContacts.update(list => [...list, { id: Date.now().toString(), name, email, type: this.newEmailType }]);
    this._saveEmail();
    this.newEmailName = ''; this.newEmailAddr = '';
    this.snackBar.open('Adresă email adăugată.', '', { duration: 2000 });
  }

  removeEmail(id: string): void {
    this.emailContacts.update(list => list.filter(c => c.id !== id));
    this._saveEmail();
  }

  saveBufferEmail(): void {
    const val = this.bufferEmail.trim();
    if (!val) return;
    this.catalogsService.setBufferNotifyEmail(val);
    this.snackBar.open('Email notificare buffer salvat.', '', { duration: 2000 });
  }

  private _saveEmail(): void { this.storage.set('app_email_contacts', this.emailContacts()); }
}
