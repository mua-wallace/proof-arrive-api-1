import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsOptional,
} from 'class-validator';

export class CreateUserDto {
  @ApiProperty({
    example: '123',
    description: 'Account ID from Malambi',
  })
  @IsString()
  @IsNotEmpty()
  accid: string;

  @ApiProperty({
    example: '456',
    description: 'Sub account ID',
  })
  @IsString()
  @IsNotEmpty()
  subid: string;

  @ApiProperty({
    example: 'john.doe',
    description: 'Username',
  })
  @IsString()
  @IsNotEmpty()
  username: string;

  @ApiProperty({
    example: 'john.doe@company.com',
    description: 'Login username',
  })
  @IsString()
  @IsNotEmpty()
  loginusername: string;

  @ApiProperty({
    example: 'Company Name',
    description: 'Company name',
  })
  @IsString()
  @IsNotEmpty()
  company: string;

  @ApiProperty({
    example: 'partner123',
    description: 'Partner identifier',
  })
  @IsString()
  @IsNotEmpty()
  partner: string;

  @ApiPropertyOptional({
    example: 'refresh_token_here',
    description: 'Refresh token (optional)',
  })
  @IsString()
  @IsOptional()
  refresh_token?: string;

  // Internal fields from Malambi API (usually set automatically)
  @ApiPropertyOptional({
    example: 'k_u_value',
    description: 'K_U value from Malambi',
  })
  @IsString()
  @IsOptional()
  k_u?: string;

  @ApiPropertyOptional({
    example: 'pid_value',
    description: 'PID value from Malambi',
  })
  @IsString()
  @IsOptional()
  pid?: string;

  @ApiPropertyOptional({
    example: 'k_k_value',
    description: 'K_K value from Malambi',
  })
  @IsString()
  @IsOptional()
  k_k?: string;

  @ApiPropertyOptional({
    example: 'k_p_value',
    description: 'K_P value from Malambi',
  })
  @IsString()
  @IsOptional()
  k_p?: string;

  @ApiPropertyOptional({
    example: 'token_value',
    description: 'Token from Malambi',
  })
  @IsString()
  @IsOptional()
  token?: string;

  @ApiPropertyOptional({
    example: 'session_value',
    description: 'Session from Malambi',
  })
  @IsString()
  @IsOptional()
  session?: string;

  @ApiPropertyOptional({
    example: '2025-12-31',
    description: 'Expiration date',
  })
  @IsString()
  @IsOptional()
  expire?: string;
}

