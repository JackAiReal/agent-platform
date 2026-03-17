import { ApiHttpClient } from './http';
import {
  NotificationLogVO,
  NotificationTimeoutCheckPayload,
  NotificationTimeoutCheckResponse,
} from './types';

export function createNotificationsApi(client: ApiHttpClient) {
  return {
    checkLeaveNoticeTimeouts(payload?: NotificationTimeoutCheckPayload) {
      return client.post<NotificationTimeoutCheckResponse>('/notifications/leave-notices/check-timeouts', payload, true);
    },

    dispatchPending(limit = 100) {
      return client.post<{ dispatched: number; failed: number; skipped: number }>(
        '/notifications/dispatch-pending',
        { limit },
        true,
      );
    },

    metrics() {
      return client.get<Record<string, unknown>>('/notifications/metrics', true);
    },

    logs(payload?: { status?: string; limit?: number }) {
      const query = new URLSearchParams();
      if (payload?.status) query.set('status', payload.status);
      if (payload?.limit) query.set('limit', String(payload.limit));
      const suffix = query.toString() ? `?${query.toString()}` : '';
      return client.get<NotificationLogVO[]>(`/notifications/logs${suffix}`, true);
    },
  };
}
