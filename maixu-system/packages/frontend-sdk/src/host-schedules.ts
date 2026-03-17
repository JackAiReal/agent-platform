import { ApiHttpClient } from './http';
import {
  HostOverrideCreatePayload,
  HostOverrideVO,
  HostResolveVO,
  HostScheduleCreatePayload,
  HostScheduleVO,
} from './types';

export function createHostSchedulesApi(client: ApiHttpClient) {
  return {
    resolve(roomId: string, payload?: { slotDate?: string; slotHour?: number }) {
      const query = new URLSearchParams();
      if (payload?.slotDate) query.set('slotDate', payload.slotDate);
      if (payload?.slotHour !== undefined) query.set('slotHour', String(payload.slotHour));
      const suffix = query.toString() ? `?${query.toString()}` : '';
      return client.get<HostResolveVO>(`/host-schedules/rooms/${roomId}/resolve${suffix}`);
    },

    list(roomId: string) {
      return client.get<HostScheduleVO[]>(`/host-schedules/rooms/${roomId}`, true);
    },

    create(roomId: string, payload: HostScheduleCreatePayload) {
      return client.post<HostScheduleVO>(`/host-schedules/rooms/${roomId}`, payload, true);
    },

    remove(scheduleId: string) {
      return client.delete<{ deleted: boolean; scheduleId: string }>(`/host-schedules/${scheduleId}`, true);
    },

    listOverrides(roomId: string) {
      return client.get<HostOverrideVO[]>(`/host-schedules/rooms/${roomId}/overrides`, true);
    },

    upsertOverride(roomId: string, payload: HostOverrideCreatePayload) {
      return client.post<HostOverrideVO>(`/host-schedules/rooms/${roomId}/overrides`, payload, true);
    },

    removeOverride(overrideId: string) {
      return client.delete<{ deleted: boolean; overrideId: string }>(`/host-schedules/overrides/${overrideId}`, true);
    },
  };
}
