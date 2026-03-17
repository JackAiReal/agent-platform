import { ApiHttpClient } from './http';
import { UserBanPolicyVO, UserRoomListsVO, UserSearchPayload, UserVO } from './types';

export function createUsersApi(client: ApiHttpClient) {
  return {
    search(payload?: UserSearchPayload) {
      const query = new URLSearchParams();
      if (payload?.keyword) query.set('keyword', payload.keyword);
      if (payload?.status) query.set('status', payload.status);
      if (payload?.roomId) query.set('roomId', payload.roomId);
      if (payload?.limit) query.set('limit', String(payload.limit));
      const suffix = query.toString() ? `?${query.toString()}` : '';
      return client.get<UserVO[]>(`/users${suffix}`, true);
    },

    detail(userId: string) {
      return client.get<UserVO>(`/users/id/${userId}`, true);
    },

    updateStatus(userId: string, payload: { status: 'ACTIVE' | 'DISABLED' | 'BANNED'; reason?: string }) {
      return client.patch<UserVO>(`/users/${userId}/status`, payload, true);
    },

    roomLists(roomId: string) {
      return client.get<UserRoomListsVO>(`/users/rooms/${roomId}/lists`, true);
    },

    setWhitelist(roomId: string, payload: { userId: string; enabled: boolean }) {
      return client.post<{ roomId: string; configKey: string; values: string[] }>(
        `/users/rooms/${roomId}/lists/whitelist`,
        payload,
        true,
      );
    },

    setBlacklist(roomId: string, payload: { userId: string; enabled: boolean }) {
      return client.post<{ roomId: string; configKey: string; values: string[] }>(
        `/users/rooms/${roomId}/lists/blacklist`,
        payload,
        true,
      );
    },

    banPolicies(roomId: string, payload?: { banType?: string; activeOnly?: boolean; limit?: number }) {
      const query = new URLSearchParams();
      if (payload?.banType) query.set('banType', payload.banType);
      if (payload?.activeOnly !== undefined) query.set('activeOnly', String(payload.activeOnly));
      if (payload?.limit) query.set('limit', String(payload.limit));
      const suffix = query.toString() ? `?${query.toString()}` : '';
      return client.get<UserBanPolicyVO[]>(`/users/rooms/${roomId}/ban-policies${suffix}`, true);
    },

    createBanPolicy(roomId: string, payload: { userId: string; banType: string; reason?: string; endAt?: string }) {
      return client.post<UserBanPolicyVO>(`/users/rooms/${roomId}/ban-policies`, payload, true);
    },

    deleteBanPolicy(roomId: string, policyId: string) {
      return client.delete<{ deleted: boolean; policyId: string }>(`/users/rooms/${roomId}/ban-policies/${policyId}`, true);
    },
  };
}
