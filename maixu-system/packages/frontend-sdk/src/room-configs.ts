import { ApiHttpClient } from './http';
import { RoomConfigSnapshotVO, RoomConfigUpdatePayload } from './types';

export function createRoomConfigsApi(client: ApiHttpClient) {
  return {
    get(roomId: string) {
      return client.get<RoomConfigSnapshotVO>(`/room-configs/rooms/${roomId}`);
    },

    update(roomId: string, payload: RoomConfigUpdatePayload) {
      return client.put<RoomConfigSnapshotVO>(`/room-configs/rooms/${roomId}`, payload, true);
    },
  };
}
