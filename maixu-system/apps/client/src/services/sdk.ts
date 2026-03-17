import Taro from '@tarojs/taro';
import { createMaixuSdk, createTaroTransport } from '@maixu/frontend-sdk';

const API_BASE_URL = process.env.TARO_APP_API_BASE_URL || 'http://localhost:3000/api/v1';
const TOKEN_KEY = 'maixu_access_token';
const USER_KEY = 'maixu_user_info';

export const sdk = createMaixuSdk({
  baseUrl: API_BASE_URL,
  getToken: () => Taro.getStorageSync(TOKEN_KEY),
  transport: createTaroTransport((options) => Taro.request(options)),
  onUnauthorized: () => {
    Taro.removeStorageSync(TOKEN_KEY);
    Taro.removeStorageSync(USER_KEY);
  },
});

export function setAccessToken(token: string) {
  Taro.setStorageSync(TOKEN_KEY, token);
}

export function getAccessToken() {
  return Taro.getStorageSync(TOKEN_KEY) as string | undefined;
}

export function setCurrentUser(user: unknown) {
  Taro.setStorageSync(USER_KEY, user);
}

export function getCurrentUser<T = unknown>() {
  return Taro.getStorageSync(USER_KEY) as T | undefined;
}
