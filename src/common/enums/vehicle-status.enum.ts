/**
 * Vehicle status enum
 * Tracks the current operational status of a vehicle
 * Status is derived from the latest trip event, not manually set
 */
export enum VehicleStatus {
  AVAILABLE = 'AVAILABLE', // Vehicle is empty and available for use at a center
  IN_TRANSIT = 'IN_TRANSIT', // Vehicle is moving between centers
  WAITING_IN_QUEUE = 'WAITING_IN_QUEUE', // Vehicle is waiting in queue at a center
  LOADING = 'LOADING', // Vehicle is being loaded at a center
  UNLOADING = 'UNLOADING', // Vehicle is being unloaded at a center
  IN_GARAGE = 'IN_GARAGE', // Vehicle is in the garage; currentCenterId is set to null
}
