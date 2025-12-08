import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class RefreshTokenRequest {
  @ApiProperty({
    example: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
    description: 'Refresh token to get new access token',
  })
  @IsString()
  @IsNotEmpty()
  refreshToken: string;

  @ApiPropertyOptional({
    example: 'malambi_token_123',
    description: 'Malambi API token (optional)',
  })
  @IsString()
  @IsOptional()
  acc_token?: string;

  @ApiPropertyOptional({
    example: '1',
    description: 'Account ID (optional)',
  })
  @IsString()
  @IsOptional()
  acc_id?: string;

  @ApiPropertyOptional({
    example: '101',
    description: 'Sub account ID (optional)',
  })
  @IsString()
  @IsOptional()
  acc_sid?: string;
}

