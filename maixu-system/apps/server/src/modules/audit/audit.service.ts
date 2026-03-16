import { Injectable } from '@nestjs/common';

@Injectable()
export class AuditService {
  getHealth() {
    return { module: 'audit', ok: true };
  }
}
