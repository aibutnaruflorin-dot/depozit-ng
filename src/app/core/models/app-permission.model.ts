export type PageAccess = 'full' | 'read' | 'none';

export interface AppPermission {
  id: string;
  name: string;
  isAdmin: boolean;
  pages: Record<string, PageAccess>;
}

export const APP_PAGES: { id: string; label: string }[] = [
  { id: 'catalog',      label: 'Catalog' },
  { id: 'comenzi_noi',  label: 'Comandă nouă' },
  { id: 'comenzi',      label: 'Comenzi' },
  { id: 'istoric',      label: 'Toate comenzile' },
  { id: 'transport',    label: 'Transport' },
  { id: 'cursele_mele', label: 'Cursele mele' },
  { id: 'setari',       label: 'Setări' },
  { id: 'manual',       label: 'Manual' },
];

export const DEFAULT_PERMISSIONS: AppPermission[] = [
  { id: 'keyuser',          name: 'KeyUser',          isAdmin: true,
    pages: { comenzi_noi: 'full', comenzi: 'full', catalog: 'full', transport: 'full', cursele_mele: 'full', istoric: 'full', manual: 'full', setari: 'full' } },
  { id: 'sofer',            name: 'Șofer',            isAdmin: false,
    pages: { comenzi_noi: 'none', comenzi: 'none', catalog: 'none', transport: 'full', cursele_mele: 'full', istoric: 'none', manual: 'full', setari: 'none' } },
  { id: 'ajutor_manipulant',name: 'Ajutor manipulant',isAdmin: false,
    pages: { comenzi_noi: 'none', comenzi: 'none', catalog: 'none', transport: 'read', cursele_mele: 'none', istoric: 'none', manual: 'full', setari: 'none' } },
  { id: 'contabilitate',    name: 'Contabilitate',    isAdmin: false,
    pages: { comenzi_noi: 'read', comenzi: 'read', catalog: 'read', transport: 'read', cursele_mele: 'none', istoric: 'full', manual: 'full', setari: 'none' } },
  { id: 'agent',            name: 'Agent',            isAdmin: false,
    pages: { comenzi_noi: 'full', comenzi: 'full', catalog: 'read', transport: 'read', cursele_mele: 'full', istoric: 'read', manual: 'full', setari: 'none' } },
  { id: 'sub-agent',        name: 'Sub-agent',        isAdmin: false,
    pages: { comenzi_noi: 'full', comenzi: 'none', catalog: 'read', transport: 'none', cursele_mele: 'none', istoric: 'none', manual: 'full', setari: 'none' } },
];

export const SYSTEM_PERM_IDS = ['keyuser', 'sofer', 'ajutor_manipulant'] as const;

export const DEFAULT_JOB_FUNCTIONS = [
  { id: 'keyuser',           name: 'KeyUser' },
  { id: 'administrator',     name: 'Administrator' },
  { id: 'sofer',             name: 'Șofer' },
  { id: 'ajutor_manipulant', name: 'Ajutor manipulant' },
  { id: 'casa_marcat',       name: 'Casă de marcat' },
  { id: 'contabilitate',     name: 'Contabilitate' },
];

export const SYSTEM_FUNC_IDS = ['keyuser', 'administrator', 'sofer', 'ajutor_manipulant'] as const;
