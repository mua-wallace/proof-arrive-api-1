/**
 * Exception type enum
 * Represents the type of exception reported on an in-transit trip
 */
export enum ExceptionType {
  BREAKDOWN = 'BREAKDOWN',
  ACCIDENT = 'ACCIDENT',
  OVERDUE = 'OVERDUE',
  POLICE_STOP = 'POLICE_STOP',
  OTHER = 'OTHER',
}
