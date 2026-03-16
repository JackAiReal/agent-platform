import { Injectable } from '@nestjs/common';

@Injectable()
export class InsertPolicy {
  name() { return 'insert'; }
}
