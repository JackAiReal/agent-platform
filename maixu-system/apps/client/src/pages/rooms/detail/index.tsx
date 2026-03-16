import { Button, Text, View } from '@tarojs/components';
import Taro, { getCurrentInstance, useDidShow, useUnload } from '@tarojs/taro';
import { useMemo, useRef, useState } from 'react';
import type { RankResponseVO, RoomDetailVO, UserVO } from '@maixu/frontend-sdk';
import { requireLogin } from '../../../services/auth';
import { getCurrentUser, sdk } from '../../../services/sdk';
import { showError, showSuccess } from '../../../utils/message';
import './index.scss';

export default function RoomDetailPage() {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const roomId = getCurrentInstance().router?.params?.roomId || '';
  const [room, setRoom] = useState<RoomDetailVO | null>(null);
  const [rank, setRank] = useState<RankResponseVO | null>(null);
  const currentUser = useMemo(() => getCurrentUser<UserVO>(), []);

  const myEntry = useMemo(
    () => rank?.entries.find((item) => item.userId === currentUser?.id),
    [rank, currentUser?.id],
  );

  const loadData = async () => {
    try {
      const roomDetail = await sdk.rooms.detail(roomId);
      setRoom(roomDetail);
      const rankData = await sdk.slots.rank(roomDetail.currentSlot.id);
      setRank(rankData);
    } catch (error) {
      showError(error);
    }
  };

  useDidShow(() => {
    if (!roomId) return;
    requireLogin(`/pages/rooms/detail/index?roomId=${roomId}`).then((user) => {
      if (!user) return;
      loadData();
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        loadData();
      }, 5000);
    });
  });

  useUnload(() => {
    if (timerRef.current) clearInterval(timerRef.current);
  });

  const handleJoin = async (content: string, score: number) => {
    if (!room || !currentUser?.id) return;
    try {
      const result = await sdk.rank.join(room.currentSlot.id, {
        userId: currentUser.id,
        sourceContent: content,
        score,
      });
      setRank(result.currentRank);
      showSuccess(`排麦成功 No.${result.rank ?? '-'}`);
    } catch (error) {
      showError(error);
    }
  };

  const handleCancel = async () => {
    if (!room || !currentUser?.id) return;
    try {
      const result = await sdk.rank.cancel(room.currentSlot.id, { userId: currentUser.id });
      setRank(result.currentRank);
      showSuccess('已取消排麦');
    } catch (error) {
      showError(error);
    }
  };

  if (!room) {
    return <View className='container'>加载中...</View>;
  }

  return (
    <View className='container'>
      <View className='card'>
        <View className='title'>{room.name}</View>
        <Text className='subtitle'>{room.description || '暂无描述'}</Text>
        <View className='subtitle'>当前档：{room.currentSlot.slotHour} 点</View>
        <View className='subtitle'>状态：{rank?.slot.state || room.currentSlot.state}</View>
        <View className='subtitle'>当前用户：{currentUser?.nickname || '未登录'}</View>
        <View className='btn-row' style={{ marginTop: '16px' }}>
          <Button onClick={() => Taro.navigateTo({ url: `/pages/host/dashboard/index?slotId=${room.currentSlot.id}` })}>
            打开主持台
          </Button>
        </View>
      </View>

      <View className='card'>
        <View className='title'>我的状态</View>
        {myEntry ? (
          <>
            <View className='subtitle'>当前排名：No.{myEntry.rank}</View>
            <View className='subtitle'>任务：{myEntry.sourceContent}</View>
            <View className='btn-row'>
              <Button className='danger-btn' onClick={handleCancel}>取消排麦</Button>
            </View>
          </>
        ) : (
          <>
            <View className='subtitle'>你当前不在榜单中</View>
            <View className='btn-row'>
              <Button className='primary-btn' onClick={() => handleJoin('手速', 0)}>手速</Button>
              <Button className='success-btn' onClick={() => handleJoin('任务A', 20)}>任务A</Button>
              <Button onClick={() => handleJoin('任务B', 30)}>任务B</Button>
            </View>
          </>
        )}
      </View>

      <View className='card'>
        <View className='title'>当前榜单</View>
        {(rank?.entries || []).map((item) => (
          <View className='rank-row' key={item.id}>
            <View className='rank-left'>
              <Text>No.{item.rank} · {item.user?.nickname || item.userId}</Text>
              <Text>{item.sourceContent}</Text>
            </View>
            <View className='rank-right'>{item.score}</View>
          </View>
        ))}
      </View>

      <Button onClick={loadData}>刷新榜单</Button>
    </View>
  );
}
