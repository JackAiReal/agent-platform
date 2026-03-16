import { Injectable } from '@nestjs/common';

@Injectable()
export class CancelPolicy {
  name() { return 'cancel'; }
}
