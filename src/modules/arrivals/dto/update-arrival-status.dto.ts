import { IsNotEmpty, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ArrivalStatus } from './arrival-status.enum';

export class UpdateArrivalStatusDto {
  @ApiProperty({ 
    description: 'New status for the arrival',
    enum: ArrivalStatus,
    example: ArrivalStatus.IN_PROCESSING
  })
  @IsNotEmpty()
  @IsEnum(ArrivalStatus)
  status: ArrivalStatus;
}

