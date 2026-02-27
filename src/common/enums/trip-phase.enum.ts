/**
 * Trip phase enum
 * Explicit lifecycle state of a trip — everything is attached to the trip.
 * Mobile app can GET /trips/:id and show UI based on phase; actions update phase + create events.
 */
export enum TripPhase {
  /** Trip just created; vehicle at origin in LOADING queue, waiting to start processing */
  AT_ORIGIN_ARRIVED = 'AT_ORIGIN_ARRIVED',
  /** Loading (service) started at origin */
  AT_ORIGIN_LOADING = 'AT_ORIGIN_LOADING',
  /** Loading ended; must set destination then exit */
  AT_ORIGIN_LOADING_ENDED = 'AT_ORIGIN_LOADING_ENDED',
  /** Destination set; waiting for vehicle to exit */
  READY_TO_EXIT = 'READY_TO_EXIT',
  /** Vehicle left origin; en route to destination */
  IN_TRANSIT = 'IN_TRANSIT',
  /** Vehicle arrived at destination; in UNLOADING queue, waiting to start */
  AT_DESTINATION_ARRIVED = 'AT_DESTINATION_ARRIVED',
  /** Unloading (service) started at destination */
  AT_DESTINATION_UNLOADING = 'AT_DESTINATION_UNLOADING',
  /** Unloading ended; DELIVERY auto-completes here; PICKUP may need explicit complete */
  AT_DESTINATION_UNLOADING_ENDED = 'AT_DESTINATION_UNLOADING_ENDED',
  /** Trip finished */
  COMPLETED = 'COMPLETED',
}
