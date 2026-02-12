import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsEmail, IsEnum, MaxLength } from 'class-validator';
import { UserRole } from '@modules/schemas/users.schema';

export class UpdateUserDto {
  @ApiPropertyOptional({
    description: 'User email address',
    example: 'user@example.com',
    maxLength: 255,
  })
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @ApiPropertyOptional({
    description: 'User role',
    enum: ['agent', 'admin', 'manager'],
    example: 'admin',
    default: 'agent',
  })
  @IsOptional()
  @IsEnum(['agent', 'admin', 'manager'])
  role?: UserRole;

  @ApiPropertyOptional({
    description: 'User full name',
    example: 'John Doe',
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  fullname?: string;
}
