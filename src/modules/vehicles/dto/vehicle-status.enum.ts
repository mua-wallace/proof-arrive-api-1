/**
 * Vehicle status enum
 * Tracks the current operational status of a vehicle
 */
export enum VehicleStatus {
  AVAILABLE = 'available', // Vehicle is empty and available for use
  IN_GARAGE = 'in_garage', // Vehicle is in the garage/maintenance
  IN_TRANSIT = 'in_transit', // Vehicle is moving between centers
  IN_PROCESSING = 'in_processing', // Vehicle is being processed at a center
  AT_CENTER = 'at_center', // Vehicle is at a center but not being processed
  UNAVAILABLE = 'unavailable', // Vehicle is not available (maintenance, repair, etc.)
}
