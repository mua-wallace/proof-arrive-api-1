import { Controller } from '@nestjs/common';
import { ArrivalsService } from './arrivals.service';

@Controller('arrivals')
export class ArrivalsController {
  constructor(private readonly arrivalsService: ArrivalsService) {}
}

