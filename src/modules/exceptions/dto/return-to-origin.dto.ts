import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for returning goods to origin center.
 * Sets exception status to CLOSED_RETURNED and trip phase to CLOSED_RETURNED.
 */
export class ReturnToOriginDto {
  @ApiProperty({
    description: 'Reason for returning goods to origin (required)',
    example: 'Vehicle cannot be repaired on site. No rescue vehicle available. Returning goods to Douala.',
  })
  @IsNotEmpty()
  @IsString()
  reason: string;
}
