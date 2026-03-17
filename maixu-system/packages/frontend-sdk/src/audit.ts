import { ApiHttpClient } from './http';
import { AuditLogVO } from './types';

export function createAuditApi(client: ApiHttpClient) {
  return {
    bySlot(slotId: string, limit = 50) {
      return client.get<AuditLogVO[]>(`/audit/slots/${slotId}?limit=${limit}`, true);
    },

    byRoom(roomId: string, limit = 50) {
      return client.get<AuditLogVO[]>(`/audit/rooms/${roomId}?limit=${limit}`, true);
    },
  };
}
