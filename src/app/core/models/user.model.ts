export interface User {
  id: number;
  name: string;
  username: string;
  password: string;
  role: 'admin' | 'agent';
  active: boolean;
}

export interface Session {
  userId: number;
  username: string;
  name: string;
  role: 'admin' | 'agent';
  loginTime: number;
}
