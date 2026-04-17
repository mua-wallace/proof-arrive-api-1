import { IsNotEmpty, IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for setting or updating the estimated arrival time on a trip.
 * Used at dispatch (exit-origin) or when a dispatcher updates the ETA after a delay.
 */
export class UpdateTripEtaDto {
  @ApiProperty({
    description: 'New estimated arrival time at destination (ISO 8601 or HH:mm today)',
    example: '2026-04-17T15:30:00.000Z',
  })
  @IsNotEmpty()
  @IsDateString()
  estimatedArrivalAt: string;
}
