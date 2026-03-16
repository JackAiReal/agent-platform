import { Injectable } from '@nestjs/common';

@Injectable()
export class LeaveNoticesService {
  getHealth() {
    return { module: 'leave-notices', ok: true };
  }
}
