export type Permission = 'keyuser' | 'sofer' | 'ajutor_manipulant' | 'contabilitate' | 'agent' | 'sub-agent';

export const PERMISSION_LABELS: Record<Permission, string> = {
  keyuser:           'KeyUser',
  sofer:             'Șofer',
  ajutor_manipulant: 'Ajutor manipulant',
  contabilitate:     'Contabilitate',
  agent:             'Agent',
  'sub-agent':       'Sub-agent'
};

export interface User {
  id: number;
  name: string;
  username: string;
  password: string;
  _v?: number;                 // 1 = plaintext (legacy), 2 = SHA-256
  mustChangePassword?: boolean;
  role: string;
  jobRole?: string; // legacy — migrated to role on load
  telefon?: string;
  recoveryEmail?: string;
  active: boolean;
}

export interface Session {
  userId: number;
  username: string;
  name: string;
  role: string;
  isAdmin?: boolean;
  loginTime: number;
  mustChangePassword?: boolean;
}
