import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class UpdateUserDto {
  @ApiPropertyOptional({
    example: 'john.doe',
    description: 'Username',
  })
  @IsString()
  @IsOptional()
  username?: string;

  @ApiPropertyOptional({
    example: 'john.doe@company.com',
    description: 'Login username',
  })
  @IsString()
  @IsOptional()
  loginusername?: string;

  @ApiPropertyOptional({
    example: 'Company Name',
    description: 'Company name',
  })
  @IsString()
  @IsOptional()
  company?: string;

  @ApiPropertyOptional({
    example: 'partner123',
    description: 'Partner identifier',
  })
  @IsString()
  @IsOptional()
  partner?: string;

  @ApiPropertyOptional({
    example: 'refresh_token_here',
    description: 'Refresh token',
  })
  @IsString()
  @IsOptional()
  refresh_token?: string;
}

