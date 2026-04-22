import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateCenterDto {
  @ApiProperty({ description: 'Center name', example: 'CC Y3' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiProperty({
    description: 'Geozone ID from Malambi (used as the center primary key)',
    example: 3656,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  gzone_id: number;

  @ApiPropertyOptional({ description: 'Malambi site ID (defaults to gzone_id)', example: 9164 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  siteid?: number;

  @ApiPropertyOptional({ description: 'Malambi third-party ID (defaults to gzone_id)', example: 84 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  thirdPartyId?: number;

  @ApiPropertyOptional({ description: 'Full name', example: 'Commercial Center Y3' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  fullname?: string;

  @ApiPropertyOptional({ description: 'Geozone name', example: 'CC Y3' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  geozone?: string;

  @ApiPropertyOptional({ description: 'Manager name', example: 'John Doe' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  manager?: string;

  @ApiPropertyOptional({ description: 'Group ID' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  groupid?: number;

  @ApiPropertyOptional({ description: 'Group name' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  groupname?: string;

  @ApiPropertyOptional({ description: 'Site type', example: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sitetype?: number;

  @ApiPropertyOptional({ description: 'Distance metric' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  distance?: number;

  @ApiPropertyOptional({ description: 'Opening time (weekday start)', example: '06:30' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  time1?: string;

  @ApiPropertyOptional({ description: 'Closing time (weekday end)', example: '22:00' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  time2?: string;

  @ApiPropertyOptional({ description: 'Saturday hours', example: '21:59:59' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  saturday?: string;

  @ApiPropertyOptional({ description: 'Sunday hours', example: '11:59:59' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  sunday?: string;

  @ApiPropertyOptional({ description: 'Break start time', example: '13:00' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  breakstart?: string;

  @ApiPropertyOptional({ description: 'Break stop time', example: '14:00' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  breakstop?: string;

  @ApiPropertyOptional({ description: 'Timeout in (minutes)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  timeoutin?: number;

  @ApiPropertyOptional({ description: 'Timeout in (string form)', example: '01:00' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  timeoutin_str?: string;

  @ApiPropertyOptional({ description: 'Timeout in for muros (minutes)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  timeoutin_muros?: number;

  @ApiPropertyOptional({ description: 'Timeout in for muros (string form)', example: '01:00' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  timeoutin_muros_str?: string;
}
