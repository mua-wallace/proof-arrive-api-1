import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsNumber,
  IsOptional,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class BulkVehicleAssignmentItemDto {
  @ApiProperty({
    description: 'Vehicle ID (internal database ID / thirdPartyId)',
    example: 17589,
  })
  @IsNumber()
  @Min(1)
  vehicleId: number;

  @ApiPropertyOptional({
    description:
      'Center ID (internal database ID) to set as the vehicle\'s current location (currentCenterId). Omit or set to null to clear current location.',
    example: 3656,
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_o, v) => v != null)
  @IsNumber()
  centerId?: number | null;
}

export class BulkVehicleAssignmentDto {
  @ApiProperty({
    description: 'Array of vehicle-to-center updates. Each item sets the vehicle\'s current center (currentCenterId). A vehicle can be at only one center at a time.',
    type: [BulkVehicleAssignmentItemDto],
    example: [
      { vehicleId: 17589, centerId: 3656 },
      { vehicleId: 16982, centerId: 4114 },
      { vehicleId: 17586, centerId: null },
    ],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkVehicleAssignmentItemDto)
  assignments: BulkVehicleAssignmentItemDto[];
}
