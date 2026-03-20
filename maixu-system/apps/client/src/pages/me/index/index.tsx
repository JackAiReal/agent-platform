import { Button, Input, Text, View } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { useState } from 'react';
import { clearSession, requireLogin } from '../../../services/auth';
import { sdk, setAccessToken, setCurrentUser, setRefreshToken } from '../../../services/sdk';
import {
  getActiveWechatAccount,
  logoutWechatAccount,
  syncActiveAccountProfile,
  updateActiveWechatAccountProfile,
} from '../../../services/wechat-social';
import { showError, showSuccess } from '../../../utils/message';
import './index.scss';

export default function MePage() {
  const [account, setAccount] = useState('');
  const [nickname, setNickname] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [loading, setLoading] = useState(false);

  const hydrate = () => {
    const active = getActiveWechatAccount();
    if (!active) return;
    setAccount(active.account);
    setNickname(active.nickname);
    setAvatarUrl(active.avatarUrl || '');
  };

  useDidShow(() => {
    requireLogin('/pages/me/index/index').then((user) => {
      if (!user) return;
      hydrate();
    });
  });

  const handleSave = async () => {
    try {
      setLoading(true);

      const updated = updateActiveWechatAccountProfile({
        nickname,
        avatarUrl: avatarUrl || undefined,
      });

      const result = await sdk.auth.devLogin({
        nickname: updated.nickname,
        avatarUrl: updated.avatarUrl,
        openid: updated.backendOpenid,
      });

      setAccessToken(result.accessToken);
      if (result.refreshToken) {
        setRefreshToken(result.refreshToken);
      }
      setCurrentUser(result.user);

      syncActiveAccountProfile({
        nickname: result.user.nickname,
        avatarUrl: result.user.avatarUrl,
        backendUserId: result.user.id,
      });

      showSuccess('资料已更新');
      hydrate();
    } catch (error) {
      showError(error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logoutWechatAccount();
    clearSession();
    Taro.redirectTo({ url: '/pages/auth/login/index' });
  };

  return (
    <View className='me-page'>
      <View className='card'>
        <View className='title'>个人信息</View>
        <Text className='label'>账号（不可修改）</Text>
        <Input className='input disabled' value={account} disabled />

        <Text className='label'>昵称</Text>
        <Input className='input' value={nickname} onInput={(e) => setNickname(e.detail.value)} />

        <Text className='label'>头像 URL（可选）</Text>
        <Input className='input' value={avatarUrl} onInput={(e) => setAvatarUrl(e.detail.value)} />

        <Button className='primary-btn' loading={loading} onClick={handleSave}>保存资料</Button>
      </View>

      <View className='card'>
        <Button className='danger-btn' onClick={handleLogout}>退出登录</Button>
      </View>
    </View>
  );
}
