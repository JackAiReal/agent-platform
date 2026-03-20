import { Button, Input, Text, View } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { useMemo, useState } from 'react';
import { requireLogin } from '../../../services/auth';
import {
  getAccountLabel,
  getActiveWechatAccount,
  listFriends,
  listIncomingFriendRequests,
  listOutgoingFriendRequests,
  sendFriendRequest,
  handleFriendRequest,
  type WechatAccount,
  type WechatFriendRequest,
} from '../../../services/wechat-social';
import { showError, showSuccess } from '../../../utils/message';
import './index.scss';

export default function ContactsPage() {
  const [friends, setFriends] = useState<WechatAccount[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<WechatFriendRequest[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<WechatFriendRequest[]>([]);
  const [targetAccount, setTargetAccount] = useState('');
  const [requestMessage, setRequestMessage] = useState('你好，我是微信克隆测试用户');

  const activeNickname = useMemo(() => getActiveWechatAccount()?.nickname || '未登录账号', []);

  const refreshData = () => {
    setFriends(listFriends());
    setIncomingRequests(listIncomingFriendRequests());
    setOutgoingRequests(listOutgoingFriendRequests());
  };

  useDidShow(() => {
    requireLogin('/pages/contacts/index/index').then((user) => {
      if (!user) return;
      refreshData();
    });
  });

  const handleSendRequest = async () => {
    try {
      sendFriendRequest({
        toAccount: targetAccount,
        message: requestMessage,
      });
      showSuccess('好友申请已发送');
      setTargetAccount('');
      refreshData();
    } catch (error) {
      showError(error);
    }
  };

  const handleRequest = (requestId: string, action: 'accept' | 'reject') => {
    try {
      handleFriendRequest(requestId, action);
      showSuccess(action === 'accept' ? '已通过好友申请' : '已拒绝申请');
      refreshData();
    } catch (error) {
      showError(error);
    }
  };

  return (
    <View className='contacts-page'>
      <View className='contacts-header'>
        <View className='contacts-title'>通讯录</View>
        <Text className='contacts-subtitle'>当前账号：{activeNickname}</Text>
      </View>

      <View className='card'>
        <View className='card-title'>添加好友</View>
        <Input
          className='input'
          value={targetAccount}
          placeholder='输入对方账号'
          onInput={(e) => setTargetAccount(e.detail.value)}
        />
        <Input
          className='input'
          value={requestMessage}
          placeholder='好友申请附言'
          onInput={(e) => setRequestMessage(e.detail.value)}
        />
        <Button className='primary-btn' onClick={handleSendRequest}>发送申请</Button>
      </View>

      <View className='card'>
        <View className='card-title'>收到的好友申请</View>
        {incomingRequests.length ? (
          incomingRequests.map((item) => (
            <View className='request-item' key={item.id}>
              <View className='request-main'>
                <Text className='request-name'>{getAccountLabel(item.fromAccount)}</Text>
                <Text className='request-msg'>{item.message || '请求添加你为好友'}</Text>
              </View>
              {item.status === 'pending' ? (
                <View className='request-actions'>
                  <Button size='mini' onClick={() => handleRequest(item.id, 'accept')}>通过</Button>
                  <Button size='mini' onClick={() => handleRequest(item.id, 'reject')}>拒绝</Button>
                </View>
              ) : (
                <Text className='request-status'>{item.status === 'accepted' ? '已通过' : '已拒绝'}</Text>
              )}
            </View>
          ))
        ) : (
          <View className='empty'>暂无好友申请</View>
        )}
      </View>

      <View className='card'>
        <View className='card-title'>我发出的申请</View>
        {outgoingRequests.length ? (
          outgoingRequests.map((item) => (
            <View className='request-item' key={item.id}>
              <View className='request-main'>
                <Text className='request-name'>发送给：{getAccountLabel(item.toAccount)}</Text>
                <Text className='request-msg'>{item.message || '请求添加好友'}</Text>
              </View>
              <Text className='request-status'>
                {item.status === 'pending' ? '等待处理' : item.status === 'accepted' ? '已通过' : '已拒绝'}
              </Text>
            </View>
          ))
        ) : (
          <View className='empty'>暂无发出记录</View>
        )}
      </View>

      <View className='card'>
        <View className='card-title'>我的好友</View>
        {friends.length ? (
          friends.map((friend) => (
            <View
              className='friend-item'
              key={friend.account}
              onClick={() => Taro.navigateTo({ url: `/pages/chats/direct/index?friendAccount=${friend.account}` })}
            >
              <View className='friend-avatar'>{friend.nickname.slice(0, 1)}</View>
              <View className='friend-main'>
                <Text className='friend-name'>{friend.nickname}</Text>
                <Text className='friend-account'>账号：{friend.account}</Text>
              </View>
              <Text className='friend-enter'>聊天</Text>
            </View>
          ))
        ) : (
          <View className='empty'>还没有好友，先发送一个好友申请吧</View>
        )}
      </View>
    </View>
  );
}
