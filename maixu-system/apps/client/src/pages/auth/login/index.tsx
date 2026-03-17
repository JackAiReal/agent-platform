import { Button, Input, Text, View } from '@tarojs/components';
import Taro, { getCurrentInstance, useDidShow } from '@tarojs/taro';
import { useState } from 'react';
import { restoreSession } from '../../../services/auth';
import { sdk, setAccessToken, setCurrentUser } from '../../../services/sdk';
import { showError, showSuccess } from '../../../utils/message';
import './index.scss';

const QUICK_LOGIN_USERS = [
  {
    label: '演示主持',
    nickname: '演示主持',
    openid: 'seed-host-openid',
  },
  {
    label: '演示用户',
    nickname: '演示用户',
    openid: 'seed-guest-openid',
  },
  {
    label: '系统管理员',
    nickname: '系统管理员',
    openid: 'seed-admin-openid',
  },
] as const;

export default function LoginPage() {
  const redirect = getCurrentInstance().router?.params?.redirect;
  const [nickname, setNickname] = useState('');
  const [loading, setLoading] = useState(false);

  useDidShow(() => {
    restoreSession().then((user) => {
      if (user) {
        Taro.redirectTo({ url: redirect || '/pages/rooms/index/index' });
      }
    });
  });

  const doLogin = async (payload: { nickname: string; openid?: string }) => {
    try {
      setLoading(true);
      const result = await sdk.auth.devLogin(payload);
      setAccessToken(result.accessToken);
      setCurrentUser(result.user);
      showSuccess('登录成功');
      Taro.redirectTo({ url: redirect || '/pages/rooms/index/index' });
    } catch (error) {
      showError(error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!nickname.trim()) {
      showError(new Error('请输入昵称'));
      return;
    }

    await doLogin({ nickname: nickname.trim() });
  };

  return (
    <View className='container'>
      <View className='card'>
        <View className='title'>排麦系统登录</View>
        <Text className='subtitle'>当前先走 dev 登录。数据库联调可直接用下面的种子账号。</Text>

        <Input
          className='login-input'
          placeholder='输入任意昵称登录（普通用户）'
          value={nickname}
          onInput={(e) => setNickname(e.detail.value)}
        />

        <View className='login-actions'>
          <Button className='primary-btn' loading={loading} onClick={handleLogin}>
            使用昵称登录
          </Button>
        </View>

        <View className='quick-login-title'>快速登录（数据库联调）</View>
        <View className='quick-login-list'>
          {QUICK_LOGIN_USERS.map((item) => (
            <Button
              key={item.openid}
              className='quick-login-btn'
              loading={loading}
              onClick={() => doLogin({ nickname: item.nickname, openid: item.openid })}
            >
              {item.label}
            </Button>
          ))}
        </View>
      </View>
    </View>
  );
}
