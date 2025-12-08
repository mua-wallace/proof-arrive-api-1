import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class LoginRequest {
  @ApiProperty({
    example: 'sandou',
    description: 'Username of the user',
  })
  @IsString()
  @IsNotEmpty()
  username: string;

  @ApiProperty({
    example: 'sandou2022',
    description: 'Password of the user',
  })
  @IsString()
  @IsNotEmpty()
  password: string;
}

