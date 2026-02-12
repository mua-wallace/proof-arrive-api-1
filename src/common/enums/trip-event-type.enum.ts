/**
 * Trip event type enum
 * Represents all possible events that can occur during a trip
 * Events are immutable and form the audit trail
 */
export enum TripEventType {
  ARRIVED = 'ARRIVED', // Vehicle arrived at a center
  QUEUED = 'QUEUED', // Vehicle entered a queue (loading or unloading)
  SERVICE_STARTED = 'SERVICE_STARTED', // Loading or unloading actually started
  LOADING_ENDED = 'LOADING_ENDED', // Loading completed
  UNLOADING_ENDED = 'UNLOADING_ENDED', // Unloading completed
  READY_TO_EXIT = 'READY_TO_EXIT', // Vehicle is ready to exit the center
  EXITED = 'EXITED', // Vehicle exited the center
  ARRIVED_DESTINATION = 'ARRIVED_DESTINATION', // Vehicle arrived at destination center
}
