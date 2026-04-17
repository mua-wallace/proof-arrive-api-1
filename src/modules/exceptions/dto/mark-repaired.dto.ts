import { IsNotEmpty, IsString, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO for marking a breakdown/accident as repaired and resuming the trip.
 * Sets exception status to RESOLVED_RESUMED and trip phase back to IN_TRANSIT.
 */
export class MarkRepairedDto {
  @ApiProperty({
    description: 'Name of the person who performed the repair',
    example: 'Jean-Paul Mbarga',
  })
  @IsNotEmpty()
  @IsString()
  repairedBy: string;

  @ApiProperty({
    description: 'Description of the issue and what was fixed',
    example: 'Radiator hose replaced. Coolant refilled. Engine tested OK.',
  })
  @IsNotEmpty()
  @IsString()
  repairDescription: string;

  @ApiPropertyOptional({
    description: 'Optional repair reference number',
    example: 'REP-2026-042',
  })
  @IsOptional()
  @IsString()
  repairReference?: string;
}
