import { IsNotEmpty, IsNumber, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { QueueType } from '@common/enums/queue-type.enum';

export class AddToQueueDto {
  @ApiProperty({ 
    description: 'Vehicle ID',
    example: 17589
  })
  @IsNotEmpty()
  @IsNumber()
  vehicleId: number;

  @ApiProperty({ 
    description: 'Trip ID',
    example: 1
  })
  @IsNotEmpty()
  @IsNumber()
  tripId: number;

  @ApiProperty({ 
    description: 'Queue type',
    enum: QueueType,
    example: QueueType.LOADING
  })
  @IsNotEmpty()
  @IsEnum(QueueType)
  queueType: QueueType;
}
