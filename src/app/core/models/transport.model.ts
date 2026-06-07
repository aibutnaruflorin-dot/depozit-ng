export interface TripOrderItem {
  productIndex: number;
  qty: number;
}

export interface TripDelivery {
  orderId: string;
  items: TripOrderItem[];
}

export type TransportStatus = 'planificat' | 'in_livrare' | 'livrat';

export interface Transport {
  id: string;
  vehicleId: string;
  driverId: string;
  deliveries: TripDelivery[];
  oraPlecare: string;
  oraSosire:  string;
  helper?: string;
  status: TransportStatus;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}
