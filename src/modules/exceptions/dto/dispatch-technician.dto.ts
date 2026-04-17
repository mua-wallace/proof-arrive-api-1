import { IsNotEmpty, IsString, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO for dispatching a technician to a breakdown or accident site.
 * Sets the exception status to IN_PROGRESS / AWAITING_REPAIR.
 */
export class DispatchTechnicianDto {
  @ApiProperty({
    description: 'Technician full name',
    example: 'Jean-Paul Mbarga',
  })
  @IsNotEmpty()
  @IsString()
  technicianName: string;

  @ApiProperty({
    description: 'Technician phone number',
    example: '+237 677 123 456',
  })
  @IsNotEmpty()
  @IsString()
  technicianPhone: string;

  @ApiPropertyOptional({
    description: 'Estimated arrival time at the site (free text or HH:mm)',
    example: '14:30',
  })
  @IsOptional()
  @IsString()
  estimatedArrivalTime?: string;

  @ApiPropertyOptional({
    description: 'Additional notes',
    example: 'Technician is coming from the Douala workshop',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}
