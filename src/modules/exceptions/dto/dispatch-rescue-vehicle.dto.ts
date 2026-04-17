import { IsNotEmpty, IsNumber, IsString, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO for dispatching a rescue vehicle to transfer goods from a broken-down or accident vehicle.
 * Sets exception status to IN_PROGRESS and trip phase to TRANSFER_IN_PROGRESS.
 */
export class DispatchRescueVehicleDto {
  @ApiProperty({
    description: 'ID of the available rescue vehicle to dispatch',
    example: 17592,
  })
  @IsNotEmpty()
  @IsNumber()
  rescueVehicleId: number;

  @ApiProperty({
    description: 'Location where the goods transfer will happen (free text)',
    example: 'N4 km 142, breakdown site',
  })
  @IsNotEmpty()
  @IsString()
  transferLocation: string;

  @ApiPropertyOptional({
    description: 'Estimated arrival at the transfer point (free text or time)',
    example: '15:00',
  })
  @IsOptional()
  @IsString()
  estimatedArrival?: string;

  @ApiPropertyOptional({
    description: 'Additional notes',
    example: 'Rescue vehicle dispatched from Douala center',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}
