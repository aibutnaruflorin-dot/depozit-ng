export type JobRole    = 'sofer' | 'ajutor_manipulant' | 'casa_marcat' | 'contabilitate';
export type Permission = 'admin' | 'contabilitate' | 'agent' | 'sub-agent';

export const JOB_ROLE_LABELS: Record<JobRole, string> = {
  sofer:             'Șofer',
  ajutor_manipulant: 'Ajutor manipulant',
  casa_marcat:       'Casă de marcat',
  contabilitate:     'Contabilitate'
};

export const PERMISSION_LABELS: Record<Permission, string> = {
  admin:         'Admin',
  contabilitate: 'Contabilitate',
  agent:         'Agent',
  'sub-agent':   'Sub-agent'
};

export interface User {
  id: number;
  name: string;
  username: string;
  password: string;
  role: Permission;
  jobRole?: JobRole;
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
