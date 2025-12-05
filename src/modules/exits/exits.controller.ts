import { Controller } from '@nestjs/common';
import { ExitsService } from './exits.service';

@Controller('exits')
export class ExitsController {
  constructor(private readonly exitsService: ExitsService) {}
}

