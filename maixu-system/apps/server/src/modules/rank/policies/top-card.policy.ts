import { Injectable } from '@nestjs/common';

@Injectable()
export class TopCardPolicy {
  name() { return 'top-card'; }
}
