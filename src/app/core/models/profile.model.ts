export interface Profile {
  id: string;
  username: string;
  name: string;
  role: string;
  active: boolean;
  must_change_password: boolean;
  created_at: string;
}
