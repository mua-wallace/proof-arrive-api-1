/**
 * Exception status enum
 * Tracks the lifecycle of a trip exception from report to resolution
 */
export enum ExceptionStatus {
  /** Exception has been reported and needs action */
  ACTIVE = 'ACTIVE',
  /** Technician dispatched or investigation underway */
  IN_PROGRESS = 'IN_PROGRESS',
  /** Vehicle repaired and trip resumed */
  RESOLVED_RESUMED = 'RESOLVED_RESUMED',
  /** Goods transferred to rescue vehicle; original trip sealed */
  CLOSED_TRANSFERRED = 'CLOSED_TRANSFERRED',
  /** Goods returned to origin center */
  CLOSED_RETURNED = 'CLOSED_RETURNED',
  /** Driver unreachable; escalated (no-show) */
  ESCALATED = 'ESCALATED',
  /** Exception cancelled or resolved without further action */
  CANCELLED = 'CANCELLED',
}
