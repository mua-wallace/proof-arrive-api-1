import { IsNotEmpty, IsNumber, IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CargoCondition } from '@common/enums/cargo-condition.enum';

/**
 * DTO for confirming a goods transfer at the breakdown/accident site.
 * Staff scans rescue vehicle QR, then fills in this form.
 * Original trip is sealed (CLOSED_TRANSFERRED) and a rescue trip is auto-created.
 */
export class ConfirmTransferDto {
  @ApiProperty({
    description: 'Number of cargo units transferred (pre-filled from manifest, editable)',
    example: 12,
  })
  @IsNotEmpty()
  @IsNumber()
  cargoCountTransferred: number;

  @ApiProperty({
    description: 'Condition of the goods at transfer',
    enum: CargoCondition,
    example: CargoCondition.GOOD,
  })
  @IsNotEmpty()
  @IsEnum(CargoCondition)
  cargoCondition: CargoCondition;

  @ApiPropertyOptional({
    description: 'Additional notes about the transfer',
    example: 'All 12 pallets transferred successfully. No visible damage.',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}
