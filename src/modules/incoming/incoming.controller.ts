import { Controller } from '@nestjs/common';
import { IncomingService } from './incoming.service';

@Controller('incoming')
export class IncomingController {
  constructor(private readonly incomingService: IncomingService) {}
}

