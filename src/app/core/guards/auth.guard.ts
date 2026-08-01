import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { StorageService } from '../services/storage.service';
import { AppPermission, DEFAULT_PERMISSIONS } from '../models/app-permission.model';

export const authGuard: CanActivateFn = async (route, state) => {
  const auth   = inject(AuthService);
  const router = inject(Router);
  const session = await auth.refreshSession();
  if (!session) { router.navigate(['/login']); return false; }

  if (session.mustChangePassword &&
      !state.url.startsWith('/app/account') &&
      !state.url.startsWith('/app/m-account')) {
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    router.navigate([isMobile ? '/app/m-account' : '/app/account'], { queryParams: { forceChange: '1' } });
    return false;
  }

  return true;
};

export const adminGuard: CanActivateFn = async () => {
  const auth   = inject(AuthService);
  const router = inject(Router);
  const session = await auth.refreshSession();
  if (!session)         { router.navigate(['/login']);        return false; }
  if (!session.isAdmin) {
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    router.navigate([isMobile ? '/app/m-account' : '/app/account']);
    return false;
  }
  return true;
};

export const pageGuard: CanActivateFn = async (route) => {
  const auth    = inject(AuthService);
  const storage = inject(StorageService);
  const router  = inject(Router);

  const session = await auth.refreshSession();
  if (!session) { router.navigate(['/login']); return false; }

  if (session.mustChangePassword) {
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    router.navigate([isMobile ? '/app/m-account' : '/app/account'], { queryParams: { forceChange: '1' } });
    return false;
  }

  if (session.isAdmin) return true;

  const pageId = route.data['pageId'] as string;
  const perms: AppPermission[] = storage.get('app_permissions') ?? DEFAULT_PERMISSIONS;
  const perm = perms.find(p => p.id === session.role);
  const access = perm?.pages?.[pageId] ?? 'none';

  if (access !== 'none') return true;

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  router.navigate([isMobile ? '/app/m-account' : '/app/account']);
  return false;
};
