import { Button, Text, View } from '@tarojs/components';
import Taro, { getCurrentInstance, useDidShow, useUnload } from '@tarojs/taro';
import { useMemo, useRef, useState } from 'react';
import type { LeaveNoticeSnapshotVO, RankResponseVO, RoomDetailVO, UserVO } from '@maixu/frontend-sdk';
import { requireLogin } from '../../../services/auth';
import { getCurrentUser, sdk } from '../../../services/sdk';
import { createWsRankSubscription } from '../../../services/ws';
import { showError, showSuccess } from '../../../utils/message';
import './index.scss';

export default function RoomDetailPage() {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wsCleanupRef = useRef<null | (() => void)>(null);
  const roomId = getCurrentInstance().router?.params?.roomId || '';
  const [room, setRoom] = useState<RoomDetailVO | null>(null);
  const [rank, setRank] = useState<RankResponseVO | null>(null);
  const [leaveSnapshot, setLeaveSnapshot] = useState<LeaveNoticeSnapshotVO | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const currentUser = useMemo(() => getCurrentUser<UserVO>(), []);

  const myEntry = useMemo(
    () => rank?.entries.find((item) => item.userId === currentUser?.id),
    [rank, currentUser?.id],
  );

  const myLeaveNotice = useMemo(
    () => leaveSnapshot?.activeNotices.find((item) => item.userId === currentUser?.id) ?? null,
    [leaveSnapshot, currentUser?.id],
  );

  const loadData = async () => {
    try {
      const roomDetail = await sdk.rooms.detail(roomId);
      setRoom(roomDetail);
      const rankData = await sdk.slots.rank(roomDetail.currentSlot.id);
      setRank(rankData);
      const leaveData = await sdk.leaveNotices.list(roomDetail.currentSlot.id);
      setLeaveSnapshot(leaveData);
    } catch (error) {
      showError(error);
    }
  };

  useDidShow(() => {
    if (!roomId) return;
    requireLogin(`/pages/rooms/detail/index?roomId=${roomId}`).then(async (user) => {
      if (!user) return;
      try {
        const roomDetail = await sdk.rooms.detail(roomId);
        setRoom(roomDetail);
        const rankData = await sdk.slots.rank(roomDetail.currentSlot.id);
        setRank(rankData);
        const leaveData = await sdk.leaveNotices.list(roomDetail.currentSlot.id);
        setLeaveSnapshot(leaveData);

        wsCleanupRef.current?.();
        wsCleanupRef.current = createWsRankSubscription({
          slotId: roomDetail.currentSlot.id,
          roomId: roomDetail.id,
          onConnected: () => setWsConnected(true),
          onDisconnected: () => setWsConnected(false),
          onRankUpdated: (nextRank) => {
            setRank(nextRank);
          },
          onLeaveNoticeUpdated: (snapshot) => {
            setLeaveSnapshot(snapshot);
          },
        });
      } catch (error) {
        showError(error);
      }

      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        loadData();
      }, 15000);
    });
  });

  useUnload(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    wsCleanupRef.current?.();
    wsCleanupRef.current = null;
    setWsConnected(false);
  });

  const ensureChallengeTicket = async () => {
    if (!room || !currentUser?.id || !room.config.enableChallenge) {
      return undefined;
    }

    const issueResult = await sdk.challenges.issue(room.currentSlot.id, {
      userId: currentUser.id,
    });

    if (!issueResult.enabled || issueResult.bypass) {
      return undefined;
    }

    const modal = await Taro.showModal({
      title: '排麦挑战验证',
      content: issueResult.promptText || '请输入挑战答案',
      editable: true,
      placeholderText: '请输入答案',
      confirmText: '提交',
      cancelText: '取消',
    });

    if (!modal.confirm) {
      throw new Error('已取消挑战验证');
    }

    const answer = (modal.content || '').trim();
    if (!answer) {
      throw new Error('请输入挑战答案');
    }

    const verifyResult = await sdk.challenges.verify(room.currentSlot.id, {
      challengeId: issueResult.challengeId || '',
      userId: currentUser.id,
      answer,
    });

    if (!verifyResult.passed || !verifyResult.ticket) {
      throw new Error(verifyResult.reason || '挑战验证失败，请重试');
    }

    return verifyResult.ticket;
  };

  const handleJoin = async (content: string, score: number) => {
    if (!room || !currentUser?.id) return;
    try {
      const challengeTicket = await ensureChallengeTicket();
      const result = await sdk.rank.join(room.currentSlot.id, {
        userId: currentUser.id,
        sourceContent: content,
        score,
        challengeTicket,
      });

      if (!result.accepted) {
        if (result.currentRank) {
          setRank(result.currentRank);
        }
        throw new Error(result.reason || '排麦失败');
      }

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

  const handleLeaveReport = async (minutes: number) => {
    if (!room) return;

    try {
      const result = await sdk.leaveNotices.report(room.currentSlot.id, {
        minutes,
      });
      setLeaveSnapshot(result.snapshot);
      showSuccess(`已报备暂离 ${minutes} 分钟`);
    } catch (error) {
      showError(error);
    }
  };

  const handleLeaveReturn = async () => {
    if (!room) return;

    try {
      const result = await sdk.leaveNotices.returnFromLeave(room.currentSlot.id);
      setLeaveSnapshot(result.snapshot);
      showSuccess('已标记回厅');
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
        <View className='subtitle'>挑战验证：{room.config.enableChallenge ? '开启' : '关闭'}</View>
        <View className='subtitle'>实时刷新：{wsConnected ? 'WebSocket 已连接' : '轮询兜底中'}</View>
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
            {room.config.enableChallenge ? (
              <View className='challenge-tip'>加榜前需完成挑战验证</View>
            ) : null}
            <View className='btn-row'>
              <Button className='primary-btn' onClick={() => handleJoin('手速', 0)}>手速</Button>
              <Button className='success-btn' onClick={() => handleJoin('任务A', 20)}>任务A</Button>
              <Button onClick={() => handleJoin('任务B', 30)}>任务B</Button>
            </View>
          </>
        )}
      </View>

      <View className='card'>
        <View className='title'>暂离报备</View>
        <View className='subtitle'>当前暂离人数：{leaveSnapshot?.activeNotices.length || 0}</View>
        {myLeaveNotice ? (
          <>
            <View className='subtitle'>你已报备暂离</View>
            <View className='subtitle'>最晚回厅：{new Date(myLeaveNotice.returnDeadline).toLocaleTimeString()}</View>
            <View className='btn-row'>
              <Button className='success-btn' onClick={handleLeaveReturn}>我已回厅</Button>
            </View>
          </>
        ) : (
          <>
            <View className='subtitle'>如需短暂离开可先报备，避免主持误判掉麦。</View>
            <View className='btn-row'>
              <Button onClick={() => handleLeaveReport(5)}>报备 5 分钟</Button>
              <Button onClick={() => handleLeaveReport(10)}>报备 10 分钟</Button>
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
