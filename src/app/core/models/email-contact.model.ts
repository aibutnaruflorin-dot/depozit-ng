export interface EmailContact {
  id: string;
  name: string;
  email: string;
  type: 'individual' | 'list';
}
