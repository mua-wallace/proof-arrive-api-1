import { IsNotEmpty, IsEnum, IsOptional, IsObject, IsNumber } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TripEventType } from '@common/enums/trip-event-type.enum';

export class CreateTripEventDto {
  @ApiProperty({ 
    description: 'Type of trip event',
    enum: TripEventType,
    example: TripEventType.ARRIVED
  })
  @IsNotEmpty()
  @IsEnum(TripEventType)
  eventType: TripEventType;

  @ApiProperty({ 
    description: 'Center ID where the event occurred',
    example: 4114
  })
  @IsNotEmpty()
  @IsNumber()
  centerId: number;

  @ApiPropertyOptional({ 
    description: 'Additional metadata (JSON object) - can include weight, notes, queue_position, etc.',
    example: { weight: 5000, notes: 'Loaded timber', queue_position: 3 }
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}
