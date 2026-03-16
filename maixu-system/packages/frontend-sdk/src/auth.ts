import { ApiHttpClient } from './http';
import { AuthLoginPayload, AuthLoginResponse, UserVO } from './types';

export function createAuthApi(client: ApiHttpClient) {
  return {
    devLogin(payload: AuthLoginPayload) {
      return client.post<AuthLoginResponse>('/auth/dev-login', payload);
    },

    wechatMiniLogin(payload: AuthLoginPayload) {
      return client.post<AuthLoginResponse>('/auth/wechat-mini/login', payload);
    },

    me() {
      return client.get<UserVO>('/auth/me', true);
    },
  };
}
