import { IsNotEmpty, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SetDestinationDto {
  @ApiProperty({
    description: 'Destination center ID',
    example: 4115,
  })
  @IsNotEmpty()
  @IsNumber()
  destinationCenterId: number;
}
