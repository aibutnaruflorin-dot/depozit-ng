export type PageAccess = 'full' | 'read' | 'none';

export interface AppPermission {
  id: string;
  name: string;
  isAdmin: boolean;
  pages: Record<string, PageAccess>;
}

export const APP_PAGES: { id: string; label: string }[] = [
  { id: 'comenzi_noi', label: 'Comandă nouă' },
  { id: 'comenzi',     label: 'Comenzi' },
  { id: 'catalog',     label: 'Catalog' },
  { id: 'transport',   label: 'Transport' },
  { id: 'istoric',     label: 'Istoric' },
  { id: 'setari',      label: 'Setări' },
];

export const DEFAULT_PERMISSIONS: AppPermission[] = [
  { id: 'admin',            name: 'Admin',            isAdmin: true,
    pages: { comenzi_noi: 'full', comenzi: 'full', catalog: 'full', transport: 'full', istoric: 'full', setari: 'full' } },
  { id: 'sofer',            name: 'Șofer',            isAdmin: false,
    pages: { comenzi_noi: 'none', comenzi: 'none', catalog: 'none', transport: 'full', istoric: 'none', setari: 'none' } },
  { id: 'ajutor_manipulant',name: 'Ajutor manipulant',isAdmin: false,
    pages: { comenzi_noi: 'none', comenzi: 'none', catalog: 'none', transport: 'read', istoric: 'none', setari: 'none' } },
  { id: 'contabilitate',    name: 'Contabilitate',    isAdmin: false,
    pages: { comenzi_noi: 'read', comenzi: 'read', catalog: 'read', transport: 'read', istoric: 'full', setari: 'none' } },
  { id: 'agent',            name: 'Agent',            isAdmin: false,
    pages: { comenzi_noi: 'full', comenzi: 'full', catalog: 'read', transport: 'read', istoric: 'read', setari: 'none' } },
  { id: 'sub-agent',        name: 'Sub-agent',        isAdmin: false,
    pages: { comenzi_noi: 'full', comenzi: 'none', catalog: 'read', transport: 'none', istoric: 'none', setari: 'none' } },
];

export const SYSTEM_PERM_IDS = ['admin', 'sofer', 'ajutor_manipulant'] as const;

export const DEFAULT_JOB_FUNCTIONS = [
  { id: 'administrator',     name: 'Administrator' },
  { id: 'sofer',             name: 'Șofer' },
  { id: 'ajutor_manipulant', name: 'Ajutor manipulant' },
  { id: 'casa_marcat',       name: 'Casă de marcat' },
  { id: 'contabilitate',     name: 'Contabilitate' },
];

export const SYSTEM_FUNC_IDS = ['administrator', 'sofer', 'ajutor_manipulant'] as const;
