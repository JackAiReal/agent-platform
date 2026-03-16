import { Injectable } from '@nestjs/common';

@Injectable()
export class HostSchedulesService {
  getHealth() {
    return { module: 'host-schedules', ok: true };
  }
}
