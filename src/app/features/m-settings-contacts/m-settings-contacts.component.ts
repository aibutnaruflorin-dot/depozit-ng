import { Component, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { StorageService } from '../../core/services/storage.service';
import { CatalogsService } from '../../core/services/catalogs.service';
import { WhatsAppContact } from '../../core/models/whatsapp.model';
import { EmailContact } from '../../core/models/email-contact.model';
import { User } from '../../core/models/user.model';
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
  users         = signal<User[]>([]);

  newWaName  = '';
  newWaPhone = '';
  newWaType: 'number' | 'group' = 'number';
  selectedWaUserId: number | null = null;

  newEmailName   = '';
  newEmailAddr   = '';
  newEmailType: 'individual' | 'list' = 'individual';
  selectedEmailUserId: number | null = null;

  bufferEmail = '';

  readonly availableWaUsers = computed(() =>
    this.users().filter(u => u.active !== false && u.telefon && !this.waContacts().some(c => c.phone === u.telefon))
  );

  readonly availableEmailUsers = computed(() =>
    this.users().filter(u => u.active !== false && u.recoveryEmail && !this.emailContacts().some(c => c.email === u.recoveryEmail))
  );

  constructor(
    private storage: StorageService,
    public catalogsService: CatalogsService,
    private snackBar: MatSnackBar
  ) {
    this.waContacts.set(this.storage.get<WhatsAppContact[]>('app_whatsapp_contacts') ?? []);
    this.emailContacts.set(this.storage.get<EmailContact[]>('app_email_contacts') ?? []);
    this.users.set(this.storage.get<User[]>('app_users') ?? []);
    this.bufferEmail = this.catalogsService.bufferNotifyEmail();
  }

  // ── WhatsApp ─────────────────────────────────────────────────────────────

  isUserWaEnabled(user: User): boolean {
    return !!user.telefon && this.waContacts().some(c => c.phone === user.telefon);
  }

  toggleUserWa(user: User): void {
    if (!user.telefon) return;
    if (this.isUserWaEnabled(user)) {
      this.waContacts.update(list => list.filter(c => c.phone !== user.telefon));
    } else {
      if (this.waContacts().some(c => c.name.toLowerCase() === user.name.toLowerCase())) {
        this.snackBar.open(`Există deja un contact cu numele "${user.name}".`, '', { duration: 3000 }); return;
      }
      this.waContacts.update(list => [...list, { id: Date.now().toString(), name: user.name, phone: user.telefon!, type: 'number' }]);
    }
    this._saveWa();
  }

  addWaGroup(): void {
    const name = this.newWaName.trim(), phone = this.newWaPhone.trim();
    if (!name || !phone) return;
    if (this.users().some(u => u.telefon === phone)) {
      this.snackBar.open('Numărul aparține unui utilizator din sistem. Activați-l din lista de mai sus.', '', { duration: 3500 }); return;
    }
    if (this.waContacts().some(c => c.phone === phone)) {
      this.snackBar.open('Numărul/link-ul este deja în lista WhatsApp.', '', { duration: 2500 }); return;
    }
    if (this.waContacts().some(c => c.name.toLowerCase() === name.toLowerCase())) {
      this.snackBar.open(`Există deja un contact WhatsApp cu numele "${name}".`, '', { duration: 3000 }); return;
    }
    this.waContacts.update(list => [...list, { id: Date.now().toString(), name, phone, type: 'group' }]);
    this._saveWa();
    this.newWaName = ''; this.newWaPhone = '';
    this.snackBar.open('Grup WhatsApp adăugat.', '', { duration: 2000 });
  }

  removeWa(id: string): void {
    this.waContacts.update(list => list.filter(c => c.id !== id));
    this._saveWa();
  }

  private _saveWa(): void { this.storage.set('app_whatsapp_contacts', this.waContacts()); }

  // ── Email ─────────────────────────────────────────────────────────────────

  isUserEmailEnabled(user: User): boolean {
    return !!user.recoveryEmail && this.emailContacts().some(c => c.email === user.recoveryEmail);
  }

  toggleUserEmail(user: User): void {
    if (!user.recoveryEmail) return;
    if (this.isUserEmailEnabled(user)) {
      this.emailContacts.update(list => list.filter(c => c.email !== user.recoveryEmail));
    } else {
      if (this.emailContacts().some(c => c.name.toLowerCase() === user.name.toLowerCase())) {
        this.snackBar.open(`Există deja un contact cu numele "${user.name}".`, '', { duration: 3000 }); return;
      }
      this.emailContacts.update(list => [...list, { id: Date.now().toString(), name: user.name, email: user.recoveryEmail!, type: 'individual' }]);
    }
    this._saveEmail();
  }

  addEmailList(): void {
    const name = this.newEmailName.trim(), email = this.newEmailAddr.trim();
    if (!name || !email) return;
    if (this.users().some(u => u.recoveryEmail === email)) {
      this.snackBar.open('Adresa aparține unui utilizator din sistem. Activați-o din lista de mai sus.', '', { duration: 3500 }); return;
    }
    if (this.emailContacts().some(c => c.email === email)) {
      this.snackBar.open('Adresa email este deja în listă.', '', { duration: 2500 }); return;
    }
    if (this.emailContacts().some(c => c.name.toLowerCase() === name.toLowerCase())) {
      this.snackBar.open(`Există deja un contact Email cu numele "${name}".`, '', { duration: 3000 }); return;
    }
    this.emailContacts.update(list => [...list, { id: Date.now().toString(), name, email, type: 'list' }]);
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
