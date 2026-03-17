import Taro from '@tarojs/taro';
import type { UserVO } from '@maixu/frontend-sdk';
import { getAccessToken, getRefreshToken, sdk, setAccessToken, setCurrentUser, setRefreshToken } from './sdk';

export async function restoreSession() {
  const token = getAccessToken();
  const refreshToken = getRefreshToken();

  if (!token && !refreshToken) return null;

  try {
    const user = await sdk.auth.me();
    setCurrentUser(user);
    return user;
  } catch {
    if (!refreshToken) {
      clearSession();
      return null;
    }

    try {
      const refreshed = await sdk.auth.refresh(refreshToken);
      setAccessToken(refreshed.accessToken);
      if (refreshed.refreshToken) {
        setRefreshToken(refreshed.refreshToken);
      }
      setCurrentUser(refreshed.user);
      return refreshed.user;
    } catch {
      clearSession();
      return null;
    }
  }
}

export function clearSession() {
  Taro.removeStorageSync('maixu_access_token');
  Taro.removeStorageSync('maixu_refresh_token');
  Taro.removeStorageSync('maixu_user_info');
}

export async function requireLogin(redirectUrl?: string) {
  const user = await restoreSession();
  if (user) return user;

  const target = redirectUrl
    ? `/pages/auth/login/index?redirect=${encodeURIComponent(redirectUrl)}`
    : '/pages/auth/login/index';

  await Taro.redirectTo({ url: target });
  return null;
}

export function buildUserLabel(user?: UserVO | null) {
  if (!user) return '未登录';
  return user.nickname || user.id;
}
