import { Button, Input, Text, View } from '@tarojs/components';
import Taro, { getCurrentInstance, useDidShow } from '@tarojs/taro';
import { useState } from 'react';
import { restoreSession } from '../../../services/auth';
import { sdk, setAccessToken, setCurrentUser } from '../../../services/sdk';
import { showError, showSuccess } from '../../../utils/message';
import './index.scss';

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

  const handleLogin = async () => {
    if (!nickname.trim()) {
      showError(new Error('请输入昵称'));
      return;
    }

    try {
      setLoading(true);
      const result = await sdk.auth.devLogin({ nickname: nickname.trim() });
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

  return (
    <View className='container'>
      <View className='card'>
        <View className='title'>排麦系统登录</View>
        <Text className='subtitle'>当前先走 demo 登录，后面可以直接替换成微信登录。</Text>
        <Input
          className='login-input'
          placeholder='请输入昵称'
          value={nickname}
          onInput={(e) => setNickname(e.detail.value)}
        />
        <View className='login-actions'>
          <Button className='primary-btn' loading={loading} onClick={handleLogin}>
            进入系统
          </Button>
        </View>
      </View>
    </View>
  );
}
