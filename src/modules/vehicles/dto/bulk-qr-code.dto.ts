import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class BulkQrCodeDto {
  @ApiProperty({
    example: [16982, 17589, 17586],
    description: 'Array of vehicle IDs (thirdPartyId from Malambi API) to generate QR codes for',
    type: [Number],
  })
  @IsArray()
  @IsNumber({}, { each: true })
  @Min(1, { each: true })
  @Type(() => Number)
  vehicleIds: number[];
}
