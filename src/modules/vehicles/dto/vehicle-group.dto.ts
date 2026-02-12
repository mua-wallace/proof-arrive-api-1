import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class VehicleDto {
  @ApiProperty({ example: 16982 })
  id: number;

  @ApiProperty({ example: 16982, required: false })
  @ApiPropertyOptional()
  thirdPartyId?: number;

  @ApiProperty({ example: 267, required: false })
  @ApiPropertyOptional()
  accountId?: number;

  @ApiProperty({ example: 'CH 032081' })
  plate: string;

  @ApiProperty({ example: 'L200', required: false })
  @ApiPropertyOptional()
  model?: string;

  @ApiProperty({ example: 'Mitsubishi', required: false })
  @ApiPropertyOptional()
  brand?: string;

  @ApiProperty({ example: 2020, required: false })
  @ApiPropertyOptional()
  year?: number;

  @ApiProperty({ example: 'TAG123', required: false })
  @ApiPropertyOptional()
  tag2?: string;

  @ApiProperty({ example: true, required: false })
  @ApiPropertyOptional()
  isActive?: boolean;

  @ApiProperty({ example: '2024-01-15T10:30:00Z', required: false })
  @ApiPropertyOptional()
  lastSyncedAt?: Date;

  @ApiProperty({ example: '2024-01-15T10:30:00Z', required: false })
  @ApiPropertyOptional()
  createdAt?: Date;

  @ApiProperty({ example: '2024-01-15T10:30:00Z', required: false })
  @ApiPropertyOptional()
  updatedAt?: Date;

  @ApiProperty({ example: 'data:image/png;base64,iVBORw0KGgoAAAANS...', required: false })
  @ApiPropertyOptional()
  qrCodeDataUrl?: string;

  @ApiProperty({ example: '16982', required: false })
  @ApiPropertyOptional()
  qrCodeString?: string;

  // Note: groupId is excluded from VehicleDto when returned in groups context
}

export class VehicleGroupDto {
  @ApiProperty({ example: 123 })
  groupId: number;

  @ApiProperty({ example: 'Company Fleet' })
  groupName: string;

  @ApiProperty({ example: 4 })
  total: number;

  @ApiProperty({ type: () => [VehicleDto] })
  vehicles: VehicleDto[];
}

export function transformVehicleGroups(rawGroups: any[]): VehicleGroupDto[] {
  return rawGroups.map((group: any) => {
    console.log('Group children:', JSON.stringify(group.children, null, 2));
    return {
      groupId: group.oid,
      groupName: group.text,
      total: group.t ?? 0,
      vehicles: (group.children || []).map((vehicle: any): VehicleDto => {
        console.log('Vehicle child:', JSON.stringify(vehicle, null, 2));
        const text: string = vehicle.text || '';

        // Extract model from parentheses
        const match = text.match(/\(([^)]+)\)/);
        const model = match ? match[1] : undefined;

        // Keep everything up to and including "CLN"
        const plateMatch = text.match(/^.*?\bCLN\b/i);
        const plate = plateMatch
          ? plateMatch[0].trim()
          : text.replace(/\(.*?\)/, '').trim();

        return {
          id: vehicle.oid,
          thirdPartyId: vehicle.oid, // Malambi API vehicle ID
          plate,
          model,
          brand: vehicle.brand,
          year: vehicle.year,
          tag2: vehicle.tag2,
        };
      }),
    };
  });
}
