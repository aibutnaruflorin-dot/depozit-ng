import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { ProductsService } from '../../core/services/products.service';
import { StorageService } from '../../core/services/storage.service';
import { AppSettings } from '../../core/models/product.model';
import { MatTabsModule } from '@angular/material/tabs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatRadioModule } from '@angular/material/radio';
import { MatCardModule } from '@angular/material/card';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    MatTabsModule, MatFormFieldModule, MatInputModule, MatButtonModule,
    MatIconModule, MatRadioModule, MatCardModule, MatSnackBarModule, MatProgressBarModule, FormsModule
  ],
  templateUrl: './settings.component.html',
  styleUrl:    './settings.component.scss'
})
export class SettingsComponent implements OnInit {
  apiForm: FormGroup;
  passForm: FormGroup;
  dataSource = signal<'excel' | 'api'>('excel');
  apiStatus  = signal<{ ok: boolean; msg: string } | null>(null);
  importing  = signal(false);
  testing    = signal(false);
  syncing    = signal(false);
  passMsgOk  = false;
  passMsg    = '';

  constructor(
    private fb: FormBuilder,
    public  auth: AuthService,
    public  productsService: ProductsService,
    private storage: StorageService,
    private snackBar: MatSnackBar
  ) {
    this.apiForm  = this.fb.group({
      apiUrl:       ['', Validators.required],
      apiKey:       ['', Validators.required],
      apiGestiune:  ['']
    });
    this.passForm = this.fb.group({
      oldPass:  ['', Validators.required],
      newPass:  ['', [Validators.required, Validators.minLength(4)]],
      confirm:  ['', Validators.required]
    });
  }

  ngOnInit(): void {
    const settings = this.storage.get<AppSettings>('app_settings');
    if (settings) {
      this.dataSource.set(settings.dataSource ?? 'excel');
      this.apiForm.patchValue({
        apiUrl:      settings.apiUrl,
        apiKey:      settings.apiKey,
        apiGestiune: settings.apiGestiune
      });
    }
  }

  onFileSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.importing.set(true);
    this.productsService.importExcel(file).then(res => {
      this.importing.set(false);
      this.snackBar.open(res.ok ? `✅ ${res.msg}` : `❌ ${res.msg}`, 'OK', {
        duration: 4000, panelClass: [res.ok ? 'snack-success' : 'snack-error']
      });
    });
  }

  async testApi(): Promise<void> {
    const { apiUrl, apiKey, apiGestiune } = this.apiForm.value;
    this.testing.set(true);
    this.apiStatus.set(null);
    const res = await this.productsService.testApi(apiUrl, apiKey, apiGestiune);
    this.apiStatus.set(res);
    this.testing.set(false);
  }

  async saveAndSync(): Promise<void> {
    if (this.apiForm.invalid) { this.apiForm.markAllAsTouched(); return; }
    const { apiUrl, apiKey, apiGestiune } = this.apiForm.value;
    const settings: AppSettings = { dataSource: 'api', apiUrl, apiKey, apiGestiune };
    this.storage.set('app_settings', settings);
    this.dataSource.set('api');
    this.syncing.set(true);
    const res = await this.productsService.fetchApi(apiUrl, apiKey, apiGestiune);
    this.syncing.set(false);
    this.snackBar.open(res.ok ? `✅ ${res.msg}` : `❌ ${res.msg}`, 'OK', {
      duration: 4000, panelClass: [res.ok ? 'snack-success' : 'snack-error']
    });
  }

  changePass(): void {
    const { oldPass, newPass, confirm } = this.passForm.value;
    if (newPass !== confirm) { this.passMsg = 'Parolele noi nu coincid.'; this.passMsgOk = false; return; }
    const session = this.auth.session();
    if (!session) return;
    const res = this.auth.changePassword(session.userId, oldPass, newPass);
    this.passMsg = res.msg; this.passMsgOk = res.ok;
    if (res.ok) this.passForm.reset();
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleString('ro-RO');
  }
}
