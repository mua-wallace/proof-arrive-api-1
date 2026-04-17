import { IsNotEmpty, IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum CallOutcome {
  ANSWERED = 'ANSWERED',
  NO_ANSWER = 'NO_ANSWER',
  VOICEMAIL = 'VOICEMAIL',
}

/**
 * DTO for logging a driver contact attempt on an overdue trip.
 * Each call attempt is a separate timestamped event on the exception timeline.
 */
export class LogCallAttemptDto {
  @ApiProperty({
    description: 'Outcome of the call',
    enum: CallOutcome,
    example: CallOutcome.NO_ANSWER,
  })
  @IsNotEmpty()
  @IsEnum(CallOutcome)
  outcome: CallOutcome;

  @ApiPropertyOptional({
    description: 'Notes from the call (e.g. what the driver said)',
    example: 'Driver says he is stuck in traffic near Edea. New ETA: 16:00.',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}
