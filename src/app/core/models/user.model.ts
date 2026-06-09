export type Permission = 'admin' | 'keyuser' | 'sofer' | 'ajutor_manipulant' | 'contabilitate' | 'agent' | 'sub-agent';

export const PERMISSION_LABELS: Record<Permission, string> = {
  admin:             'Admin',
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
  role: Permission;
  jobRole?: string; // legacy — migrated to role on load
  telefon?: string;
  recoveryEmail?: string;
  active: boolean;
}

export interface Session {
  userId: number;
  username: string;
  name: string;
  role: Permission;
  loginTime: number;
}
