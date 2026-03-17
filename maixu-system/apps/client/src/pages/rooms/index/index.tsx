import { Button, Text, View } from '@tarojs/components';
import Taro, { useDidShow, useUnload } from '@tarojs/taro';
import { useRef, useState } from 'react';
import type { RoomListItemVO, UserVO } from '@maixu/frontend-sdk';
import { buildUserLabel, requireLogin } from '../../../services/auth';
import { getCurrentUser, sdk } from '../../../services/sdk';
import { showError } from '../../../utils/message';
import './index.scss';

export default function RoomsPage() {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [rooms, setRooms] = useState<RoomListItemVO[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentUser, setCurrentUserState] = useState<UserVO | undefined>(() => getCurrentUser<UserVO>());

  const loadRooms = async () => {
    try {
      setLoading(true);
      const data = await sdk.rooms.list();
      setRooms(data);
    } catch (error) {
      showError(error);
    } finally {
      setLoading(false);
    }
  };

  useDidShow(() => {
    requireLogin('/pages/rooms/index/index').then((user) => {
      if (!user) return;
      setCurrentUserState(user);
      loadRooms();
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        loadRooms();
      }, 8000);
    });
  });

  useUnload(() => {
    if (timerRef.current) clearInterval(timerRef.current);
  });

  const handleLogout = () => {
    Taro.removeStorageSync('maixu_access_token');
    Taro.removeStorageSync('maixu_refresh_token');
    Taro.removeStorageSync('maixu_user_info');
    Taro.redirectTo({ url: '/pages/auth/login/index' });
  };

  return (
    <View className='container'>
      <View className='card'>
        <View className='title'>房间列表</View>
        <Text className='subtitle'>当前用户：{buildUserLabel(currentUser)}</Text>
        <View className='btn-row' style={{ marginTop: '16px' }}>
          <Button onClick={handleLogout}>退出登录</Button>
        </View>
      </View>

      {rooms.map((room) => (
        <View className='card' key={room.id}>
          <View className='room-item-title'>{room.name}</View>
          <View className='room-meta'>{room.description || '暂无描述'}</View>
          <View className='room-meta'>当前档：{room.currentSlot.slotHour} 点</View>
          <View className='room-meta'>当前排麦人数：{room.currentRankCount}</View>
          <View className='btn-row'>
            <Button className='primary-btn' onClick={() => Taro.navigateTo({ url: `/pages/rooms/detail/index?roomId=${room.id}` })}>
              进入房间
            </Button>
            <Button onClick={() => Taro.navigateTo({ url: `/pages/host/dashboard/index?slotId=${room.currentSlot.id}` })}>
              主持台
            </Button>
          </View>
        </View>
      ))}

      <Button loading={loading} onClick={loadRooms}>刷新</Button>
    </View>
  );
}
