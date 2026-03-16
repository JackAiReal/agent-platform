import { ApiHttpClient } from './http';
import { RoomDetailVO, RoomListItemVO, SlotVO } from './types';

export function createRoomsApi(client: ApiHttpClient) {
  return {
    list() {
      return client.get<RoomListItemVO[]>('/rooms');
    },

    detail(roomId: string) {
      return client.get<RoomDetailVO>(`/rooms/${roomId}`);
    },

    currentSlot(roomId: string) {
      return client.get<SlotVO>(`/rooms/${roomId}/current-slot`);
    },
  };
}
