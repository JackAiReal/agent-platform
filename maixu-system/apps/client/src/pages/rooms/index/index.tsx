import { Button, Input, Text, View } from '@tarojs/components';
import Taro, { useDidShow, useUnload } from '@tarojs/taro';
import { useMemo, useRef, useState } from 'react';
import type { RoomListItemVO, UserVO } from '@maixu/frontend-sdk';
import { buildUserLabel, clearSession, requireLogin } from '../../../services/auth';
import { getCurrentUser, sdk } from '../../../services/sdk';
import { showError } from '../../../utils/message';
import './index.scss';

function formatSlotTime(hour: number) {
  return `${String(hour).padStart(2, '0')}:00`;
}

function buildRoomPreview(room: RoomListItemVO) {
  if (room.currentRankCount > 0) {
    return `麦序机器人：当前有 ${room.currentRankCount} 人排麦，发送“排麦 手速”即可上麦`;
  }
  return '麦序机器人：当前空麦，发送“排麦 任务A 20”开始排麦';
}

export default function RoomsPage() {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [rooms, setRooms] = useState<RoomListItemVO[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
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
      timerRef.current = setInterval(loadRooms, 10000);
    });
  });

  useUnload(() => {
    if (timerRef.current) clearInterval(timerRef.current);
  });

  const filteredRooms = useMemo(() => {
    const sorted = [...rooms].sort((a, b) => b.currentRankCount - a.currentRankCount);
    const q = keyword.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((room) => `${room.name} ${room.description || ''}`.toLowerCase().includes(q));
  }, [rooms, keyword]);

  const handleLogout = () => {
    clearSession();
    Taro.redirectTo({ url: '/pages/auth/login/index' });
  };

  return (
    <View className='wechat-page'>
      <View className='wechat-header'>
        <View>
          <View className='wechat-title'>微信</View>
          <Text className='wechat-subtitle'>{buildUserLabel(currentUser)}</Text>
        </View>
        <Button className='header-mini-btn' size='mini' onClick={loadRooms} loading={loading}>
          刷新
        </Button>
      </View>

      <View className='search-wrap'>
        <Input
          className='search-input'
          value={keyword}
          placeholder='搜索群聊'
          onInput={(e) => setKeyword(e.detail.value)}
        />
      </View>

      <View className='chat-list'>
        {filteredRooms.map((room) => (
          <View
            className='chat-item'
            key={room.id}
            onClick={() => Taro.navigateTo({ url: `/pages/rooms/detail/index?roomId=${room.id}` })}
          >
            <View className='chat-avatar'>{room.name.slice(0, 1)}</View>
            <View className='chat-main'>
              <View className='chat-top-row'>
                <Text className='chat-name'>{room.name}</Text>
                <Text className='chat-time'>{formatSlotTime(room.currentSlot.slotHour)}</Text>
              </View>
              <Text className='chat-preview'>{buildRoomPreview(room)}</Text>
            </View>
            <View className='chat-badge'>{room.currentRankCount}</View>
          </View>
        ))}

        {!filteredRooms.length ? (
          <View className='chat-empty'>
            <Text>没找到匹配群聊</Text>
          </View>
        ) : null}
      </View>

      <View className='footer-actions'>
        <Button className='footer-btn ghost' size='mini' onClick={handleLogout}>
          退出登录
        </Button>
        <Button
          className='footer-btn'
          size='mini'
          onClick={() => Taro.navigateTo({ url: '/pages/ops/management/index' })}
        >
          运营台
        </Button>
      </View>
    </View>
  );
}
