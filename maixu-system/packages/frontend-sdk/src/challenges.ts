import { ApiHttpClient } from './http';
import {
  ChallengeIssuePayload,
  ChallengeIssueResponse,
  ChallengeVerifyPayload,
  ChallengeVerifyResponse,
} from './types';

export function createChallengesApi(client: ApiHttpClient) {
  return {
    issue(slotId: string, payload: ChallengeIssuePayload) {
      return client.post<ChallengeIssueResponse>(`/challenges/slots/${slotId}/issue`, payload);
    },

    verify(slotId: string, payload: ChallengeVerifyPayload) {
      return client.post<ChallengeVerifyResponse>(`/challenges/slots/${slotId}/verify`, payload);
    },
  };
}
