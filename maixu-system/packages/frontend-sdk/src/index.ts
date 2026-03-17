import { createAuditApi } from './audit';
import { createAuthApi } from './auth';
import { createChallengesApi } from './challenges';
import { ApiHttpClient, ApiTransport, createFetchTransport, createTaroTransport, MaixuSdkOptions } from './http';
import { createHostSchedulesApi } from './host-schedules';
import { createLeaveNoticesApi } from './leave-notices';
import { createNotificationsApi } from './notifications';
import { createRankApi } from './rank';
import { createRoomConfigsApi } from './room-configs';
import { createRoomsApi } from './rooms';
import { createSlotsApi } from './slots';

export * from './types';
export * from './http';

export function createMaixuSdk(options: MaixuSdkOptions) {
  const client = new ApiHttpClient(options);

  return {
    client,
    auth: createAuthApi(client),
    rooms: createRoomsApi(client),
    slots: createSlotsApi(client),
    rank: createRankApi(client),
    challenges: createChallengesApi(client),
    leaveNotices: createLeaveNoticesApi(client),
    roomConfigs: createRoomConfigsApi(client),
    hostSchedules: createHostSchedulesApi(client),
    notifications: createNotificationsApi(client),
    audit: createAuditApi(client),
  };
}

export { ApiHttpClient, createFetchTransport, createTaroTransport, ApiTransport };
