export type TransportStatus = 'planificat' | 'in_livrare' | 'livrat';

export interface Transport {
  id: string;
  vehicleId: string;
  driverId: string;
  orderIds: string[];
  oraPlecare: string;   // datetime-local string (YYYY-MM-DDTHH:mm)
  oraSosire: string;    // datetime-local string
  helper?: string;
  status: TransportStatus;
  createdAt: string;
}
