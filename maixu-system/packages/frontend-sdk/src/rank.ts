import { ApiHttpClient } from './http';
import {
  CancelRankPayload,
  CancelRankResponse,
  InvalidateEntryPayload,
  JoinRankPayload,
  JoinRankResponse,
  ManualAddPayload,
  RankPoliciesVO,
  RankResponseVO,
  ResetSlotResponse,
  TransferEntryPayload,
  TransferEntryResponse,
} from './types';

export function createRankApi(client: ApiHttpClient) {
  return {
    policies() {
      return client.get<RankPoliciesVO>('/rank/policies');
    },

    getSlotRank(slotId: string) {
      return client.get<RankResponseVO>(`/rank/slots/${slotId}`);
    },

    join(slotId: string, payload: JoinRankPayload) {
      return client.post<JoinRankResponse>(`/rank/slots/${slotId}/join`, payload);
    },

    cancel(slotId: string, payload: CancelRankPayload) {
      return client.post<CancelRankResponse>(`/rank/slots/${slotId}/cancel`, payload);
    },

    manualAdd(slotId: string, payload: ManualAddPayload) {
      return client.post<JoinRankResponse>(`/rank/slots/${slotId}/manual-add`, payload, true);
    },

    invalidateEntry(slotId: string, payload: InvalidateEntryPayload) {
      return client.post<CancelRankResponse>(`/rank/slots/${slotId}/invalidate-entry`, payload, true);
    },

    transferEntry(slotId: string, payload: TransferEntryPayload) {
      return client.post<TransferEntryResponse>(`/rank/slots/${slotId}/transfer-entry`, payload, true);
    },

    resetSlot(slotId: string) {
      return client.post<ResetSlotResponse>(`/rank/slots/${slotId}/reset-slot`, undefined, true);
    },
  };
}
