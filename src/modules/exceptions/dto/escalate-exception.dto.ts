import { IsNotEmpty, IsEnum, IsNumber, IsString, IsOptional, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EscalationReason } from '@common/enums/escalation-reason.enum';

/**
 * DTO for escalating an overdue trip to no-show status.
 * Used when the driver cannot be reached after multiple attempts.
 */
export class EscalateExceptionDto {
  @ApiProperty({
    description: 'Reason for escalation',
    enum: EscalationReason,
    example: EscalationReason.DRIVER_UNREACHABLE,
  })
  @IsNotEmpty()
  @IsEnum(EscalationReason)
  reason: EscalationReason;

  @ApiProperty({
    description: 'Number of contact attempts that were made',
    example: 5,
  })
  @IsNotEmpty()
  @IsNumber()
  contactAttemptsMade: number;

  @ApiProperty({
    description: 'Free-text notes explaining the situation (required)',
    example: 'Driver phone off since 14:00. Last known location was N4 km 90. Police notified.',
  })
  @IsNotEmpty()
  @IsString()
  notes: string;

  @ApiPropertyOptional({
    description: 'Actions taken (e.g. ["REPORTED_TO_POLICE","NOTIFIED_MANAGEMENT"])',
    example: ['REPORTED_TO_POLICE', 'NOTIFIED_MANAGEMENT'],
  })
  @IsOptional()
  @IsArray()
  actionsTaken?: string[];

  @ApiPropertyOptional({
    description: 'Police report reference number',
    example: 'PV-2026-04-003',
  })
  @IsOptional()
  @IsString()
  policeReportReference?: string;
}
