/**
 * Escalation reason enum
 * Used when escalating an overdue trip (no-show scenario)
 */
export enum EscalationReason {
  DRIVER_UNREACHABLE = 'DRIVER_UNREACHABLE',
  SUSPECTED_BREAKDOWN = 'SUSPECTED_BREAKDOWN',
  SUSPECTED_ACCIDENT = 'SUSPECTED_ACCIDENT',
  UNKNOWN = 'UNKNOWN',
}
