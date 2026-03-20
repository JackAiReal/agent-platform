import { Button, Input, Text, View } from '@tarojs/components';
import Taro, { getCurrentInstance, useDidShow } from '@tarojs/taro';
import { useMemo, useState } from 'react';
import { clearSession, restoreSession } from '../../../services/auth';
import { sdk, setAccessToken, setCurrentUser, setRefreshToken } from '../../../services/sdk';
import {
  getActiveWechatAccountId,
  getWechatAccountById,
  loginWechatAccount,
  registerWechatAccount,
  syncActiveAccountProfile,
} from '../../../services/wechat-social';
import { showError, showSuccess } from '../../../utils/message';
import './index.scss';

type AuthMode = 'login' | 'register';

export default function LoginPage() {
  const redirect = getCurrentInstance().router?.params?.redirect;

  const [mode, setMode] = useState<AuthMode>('login');
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [loading, setLoading] = useState(false);

  const submitLabel = useMemo(() => (mode === 'login' ? '登录' : '注册并登录'), [mode]);

  useDidShow(() => {
    restoreSession().then((user) => {
      const active = getActiveWechatAccountId();
      if (user && active) {
        Taro.redirectTo({ url: redirect || '/pages/rooms/index/index' });
        return;
      }

      if (user && !active) {
        clearSession();
      }
    });
  });

  const backendLogin = async (targetAccount: string) => {
    const localAccount = getWechatAccountById(targetAccount);
    if (!localAccount) {
      throw new Error('账号不存在');
    }

    const result = await sdk.auth.devLogin({
      nickname: localAccount.nickname,
      avatarUrl: localAccount.avatarUrl,
      openid: localAccount.backendOpenid,
    });

    setAccessToken(result.accessToken);
    if (result.refreshToken) {
      setRefreshToken(result.refreshToken);
    }
    setCurrentUser(result.user);

    syncActiveAccountProfile({
      backendUserId: result.user.id,
      nickname: result.user.nickname,
      avatarUrl: result.user.avatarUrl,
    });
  };

  const handleSubmit = async () => {
    try {
      setLoading(true);

      const nextAccount = account.trim().toLowerCase();
      const nextPassword = password.trim();

      if (!nextAccount) {
        throw new Error('请输入账号');
      }

      if (!nextPassword) {
        throw new Error('请输入密码');
      }

      if (mode === 'register') {
        registerWechatAccount({
          account: nextAccount,
          password: nextPassword,
          nickname: nickname.trim() || nextAccount,
        });
        loginWechatAccount({ account: nextAccount, password: nextPassword });
      } else {
        loginWechatAccount({ account: nextAccount, password: nextPassword });
      }

      await backendLogin(nextAccount);
      showSuccess(mode === 'login' ? '登录成功' : '注册成功');
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
        <View className='title'>微信账号登录</View>
        <Text className='subtitle'>支持注册、登录、好友、私聊和群聊联动。</Text>

        <View className='auth-mode-switch'>
          <View className={`auth-mode-item ${mode === 'login' ? 'active' : ''}`} onClick={() => setMode('login')}>
            登录
          </View>
          <View className={`auth-mode-item ${mode === 'register' ? 'active' : ''}`} onClick={() => setMode('register')}>
            注册
          </View>
        </View>

        <Input
          className='login-input'
          placeholder='账号（字母/数字）'
          value={account}
          onInput={(e) => setAccount(e.detail.value)}
        />

        <Input
          className='login-input'
          password
          placeholder='密码（至少6位）'
          value={password}
          onInput={(e) => setPassword(e.detail.value)}
        />

        {mode === 'register' ? (
          <Input
            className='login-input'
            placeholder='昵称（可选）'
            value={nickname}
            onInput={(e) => setNickname(e.detail.value)}
          />
        ) : null}

        <View className='login-actions'>
          <Button className='primary-btn' loading={loading} onClick={handleSubmit}>
            {submitLabel}
          </Button>
        </View>
      </View>
    </View>
  );
}
