export interface TripOrderItem {
  productIndex: number;
  qty: number;
}

export interface TripDelivery {
  orderId: string;
  items: TripOrderItem[];
  observatii?: string;
}

export type TransportStatus = 'planificat' | 'confirmat_sofer' | 'in_livrare' | 'livrat' | 'anulat' | 'sters';

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
  cancelledAt?: string;
  waSentDriverAt?: string;
  waSentHelperAt?: string;
}
