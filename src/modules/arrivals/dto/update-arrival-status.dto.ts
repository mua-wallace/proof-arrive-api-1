import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateArrivalStatusDto {
  @ApiProperty({ description: 'New status for the arrival' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  status: string;
}

