import { Injectable } from '@nestjs/common';

@Injectable()
export class RoomConfigsService {
  getHealth() {
    return { module: 'room-configs', ok: true };
  }
}
