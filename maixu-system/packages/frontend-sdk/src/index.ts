import { createAuthApi } from './auth';
import { ApiHttpClient, ApiTransport, createFetchTransport, createTaroTransport, MaixuSdkOptions } from './http';
import { createRankApi } from './rank';
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
  };
}

export { ApiHttpClient, createFetchTransport, createTaroTransport, ApiTransport };
