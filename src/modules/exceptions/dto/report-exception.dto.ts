import { IsNotEmpty, IsEnum, IsString, IsOptional, IsBoolean, IsNumber, IsArray, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ExceptionType } from '@common/enums/exception-type.enum';
import { AccidentSeverity } from '@common/enums/accident-severity.enum';

/**
 * DTO for reporting an exception on an in-transit trip.
 * Used from both the mobile app "Report an issue" flow and the dashboard "Report exception" button.
 */
export class ReportExceptionDto {
  @ApiProperty({
    description: 'Type of exception being reported',
    enum: ExceptionType,
    example: ExceptionType.BREAKDOWN,
  })
  @IsNotEmpty()
  @IsEnum(ExceptionType)
  type: ExceptionType;

  @ApiProperty({
    description: 'Free-text location where the incident occurred (road name, km marker, landmark)',
    example: 'N4 highway, km 142, after Edea junction',
  })
  @IsNotEmpty()
  @IsString()
  location: string;

  @ApiProperty({
    description: 'What happened — free text description of the incident',
    example: 'Engine overheated and vehicle stopped. Driver says coolant light was on for 20 minutes.',
  })
  @IsNotEmpty()
  @IsString()
  description: string;

  // --- Accident-specific fields ---

  @ApiPropertyOptional({
    description: 'Accident severity (required for ACCIDENT type)',
    enum: AccidentSeverity,
    example: AccidentSeverity.MAJOR,
  })
  @IsOptional()
  @IsEnum(AccidentSeverity)
  severity?: AccidentSeverity;

  @ApiPropertyOptional({
    description: 'Are there injuries? (for ACCIDENT type)',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  hasInjuries?: boolean;

  @ApiPropertyOptional({
    description: 'Is the cargo damaged? (for ACCIDENT type)',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  isCargoDamaged?: boolean;

  @ApiPropertyOptional({
    description: 'Cargo damage description (if isCargoDamaged is true)',
    example: '3 pallets shifted, outer packaging torn',
  })
  @IsOptional()
  @IsString()
  cargoDamageDescription?: string;

  @ApiPropertyOptional({
    description: 'Is the vehicle still driveable? (for ACCIDENT type)',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  isVehicleDriveable?: boolean;

  @ApiPropertyOptional({
    description: 'Police report reference number',
    example: 'PV-2026-04-001',
  })
  @IsOptional()
  @IsString()
  policeReportReference?: string;
}
