/**
 * Unified status enum for arrivals, exits, and related entities
 * Allowed values: arrival, arrived, in_processing, completed, cancelled, in_transit, exited
 */
export enum ArrivalStatus {
  ARRIVAL = 'arrival',
  ARRIVED = 'arrived',
  IN_PROCESSING = 'in_processing',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  IN_TRANSIT = 'in_transit',
  EXITED = 'exited',
}

