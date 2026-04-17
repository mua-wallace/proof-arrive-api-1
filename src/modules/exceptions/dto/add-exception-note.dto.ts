import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for adding a free-text note to an exception timeline.
 * Dispatcher can add updates without changing the exception status.
 */
export class AddExceptionNoteDto {
  @ApiProperty({
    description: 'Note text (e.g. "Technician confirms he is on site now")',
    example: 'Driver called, says tow truck is 20 minutes away.',
  })
  @IsNotEmpty()
  @IsString()
  note: string;
}
