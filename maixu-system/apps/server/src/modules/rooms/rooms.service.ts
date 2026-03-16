import { Injectable } from '@nestjs/common';

@Injectable()
export class RoomsService {
  getHealth() {
    return { module: 'rooms', ok: true };
  }
}
