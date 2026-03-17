import { ApiHttpClient } from './http';
import {
  LeaveNoticeMyVO,
  LeaveNoticeReportPayload,
  LeaveNoticeReportResponse,
  LeaveNoticeReturnResponse,
  LeaveNoticeSnapshotVO,
} from './types';

export function createLeaveNoticesApi(client: ApiHttpClient) {
  return {
    my(slotId: string) {
      return client.get<LeaveNoticeMyVO>(`/leave-notices/slots/${slotId}/my`, true);
    },

    list(slotId: string) {
      return client.get<LeaveNoticeSnapshotVO>(`/leave-notices/slots/${slotId}`, true);
    },

    report(slotId: string, payload: LeaveNoticeReportPayload) {
      return client.post<LeaveNoticeReportResponse>(`/leave-notices/slots/${slotId}/report`, payload, true);
    },

    returnFromLeave(slotId: string) {
      return client.post<LeaveNoticeReturnResponse>(`/leave-notices/slots/${slotId}/return`, undefined, true);
    },
  };
}
