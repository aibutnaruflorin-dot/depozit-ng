import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

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
  if (!session)               { router.navigate(['/login']);        return false; }
  if (session.role !== 'admin' && session.role !== 'keyuser') { router.navigate(['/app/catalog']); return false; }
  return true;
};
