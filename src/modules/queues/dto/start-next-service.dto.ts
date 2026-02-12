import { IsNotEmpty, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { QueueType } from '@common/enums/queue-type.enum';

export class StartNextServiceDto {
  @ApiProperty({ 
    description: 'Queue type',
    enum: QueueType,
    example: QueueType.LOADING
  })
  @IsNotEmpty()
  @IsEnum(QueueType)
  queueType: QueueType;
}
