import { IsOptional, IsNumber } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateVehicleAssignmentDto {
  @ApiPropertyOptional({ 
    description: 'Center ID (internal database ID) to assign the vehicle to. Set to null to remove assignment.',
    example: 1
  })
  @IsOptional()
  @IsNumber()
  centerId?: number | null;
}
