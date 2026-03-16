import { Injectable } from '@nestjs/common';

@Injectable()
export class TransferPolicy {
  name() { return 'transfer'; }
}
