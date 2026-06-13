import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { StorageService } from '../services/storage.service';
import { AppPermission, DEFAULT_PERMISSIONS } from '../models/app-permission.model';

export const authGuard: CanActivateFn = () => {
  const auth   = inject(AuthService);
  const router = inject(Router);
  const session = auth.refreshSession();
  if (!session) { router.navigate(['/login']); return false; }
  return true;
};

export const adminGuard: CanActivateFn = () => {
  const auth   = inject(AuthService);
  const router = inject(Router);
  const session = auth.refreshSession();
  if (!session)         { router.navigate(['/login']);        return false; }
  if (!session.isAdmin) { router.navigate(['/app/catalog']); return false; }
  return true;
};

export const pageGuard: CanActivateFn = (route) => {
  const auth    = inject(AuthService);
  const storage = inject(StorageService);
  const router  = inject(Router);

  const session = auth.refreshSession();
  if (!session) { router.navigate(['/login']); return false; }
  if (session.isAdmin) return true;

  const pageId = route.data['pageId'] as string;
  const perms: AppPermission[] = storage.get('app_permissions') ?? [];
  const perm = perms.find(p => p.id === session.role);
  const access = perm?.pages?.[pageId] ?? 'none';

  if (access !== 'none') return true;

  router.navigate(['/app/account']);
  return false;
};
