import { ApiHttpClient } from './http';
import { HostDashboardVO, RankResponseVO, SlotActionResponse, SlotVO, ToggleAddStagePayload } from './types';

export function createSlotsApi(client: ApiHttpClient) {
  return {
    detail(slotId: string) {
      return client.get<SlotVO>(`/slots/${slotId}`);
    },

    rank(slotId: string) {
      return client.get<RankResponseVO>(`/slots/${slotId}/rank`);
    },

    hostDashboard(slotId: string) {
      return client.get<HostDashboardVO>(`/slots/${slotId}/host-dashboard`, true);
    },

    userOptions(slotId: string) {
      return client.get<Array<{ id: string; nickname: string; avatarUrl?: string; createdAt?: string }>>(
        `/slots/${slotId}/user-options`,
        true,
      );
    },

    closeSpeedStage(slotId: string) {
      return client.post<SlotActionResponse>(`/slots/${slotId}/close-speed-stage`, undefined, true);
    },

    closeFinalStage(slotId: string) {
      return client.post<SlotActionResponse>(`/slots/${slotId}/close-final-stage`, undefined, true);
    },

    toggleAddStage(slotId: string, payload: ToggleAddStagePayload) {
      return client.post<SlotActionResponse>(`/slots/${slotId}/toggle-add-stage`, payload, true);
    },
  };
}
