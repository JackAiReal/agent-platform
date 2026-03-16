import { Button, Text, View } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { useState } from 'react';
import type { RoomListItemVO } from '@maixu/frontend-sdk';
import { sdk } from '../../../services/sdk';
import { showError } from '../../../utils/message';
import './index.scss';

export default function RoomsPage() {
  const [rooms, setRooms] = useState<RoomListItemVO[]>([]);
  const [loading, setLoading] = useState(false);

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
    loadRooms();
  });

  return (
    <View className='container'>
      <View className='card'>
        <View className='title'>房间列表</View>
        <Text className='subtitle'>先从这里进入房间详情页，再接用户排麦和主持台。</Text>
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
