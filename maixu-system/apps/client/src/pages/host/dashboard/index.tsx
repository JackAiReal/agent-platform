import { Button, Text, View } from '@tarojs/components';
import Taro, { getCurrentInstance, useDidShow, useUnload } from '@tarojs/taro';
import { useMemo, useRef, useState } from 'react';
import type { HostDashboardVO, LeaveNoticeSnapshotVO, RankEntryVO, UserVO } from '@maixu/frontend-sdk';
import { buildUserLabel, requireLogin } from '../../../services/auth';
import { getCurrentUser, sdk } from '../../../services/sdk';
import { createWsRankSubscription } from '../../../services/ws';
import { rankToDashboard } from '../../../utils/dashboard';
import { showError, showSuccess } from '../../../utils/message';
import './index.scss';

export default function HostDashboardPage() {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wsCleanupRef = useRef<null | (() => void)>(null);
  const slotId = getCurrentInstance().router?.params?.slotId || '';

  const [dashboard, setDashboard] = useState<HostDashboardVO | null>(null);
  const [leaveSnapshot, setLeaveSnapshot] = useState<LeaveNoticeSnapshotVO | null>(null);
  const [userOptions, setUserOptions] = useState<UserVO[]>([]);
  const [manualUserId, setManualUserId] = useState('');
  const [wsConnected, setWsConnected] = useState(false);

  const currentUser = getCurrentUser<{ nickname?: string; id?: string }>();

  const userOptionMap = useMemo(() => {
    const map = new Map<string, UserVO>();
    userOptions.forEach((item) => {
      map.set(item.id, item);
    });
    return map;
  }, [userOptions]);

  const manualUser = manualUserId ? userOptionMap.get(manualUserId) : undefined;

  const loadDashboard = async () => {
    try {
      const [dashboardData, leaveData, users] = await Promise.all([
        sdk.slots.hostDashboard(slotId),
        sdk.leaveNotices.list(slotId),
        sdk.slots.userOptions(slotId),
      ]);

      setDashboard(dashboardData);
      setLeaveSnapshot(leaveData);
      setUserOptions(users);
    } catch (error) {
      showError(error);
    }
  };

  useDidShow(() => {
    if (!slotId) return;
    requireLogin(`/pages/host/dashboard/index?slotId=${slotId}`).then(async (user) => {
      if (!user) return;

      try {
        const [dashboardData, leaveData, users] = await Promise.all([
          sdk.slots.hostDashboard(slotId),
          sdk.leaveNotices.list(slotId),
          sdk.slots.userOptions(slotId),
        ]);

        setDashboard(dashboardData);
        setLeaveSnapshot(leaveData);
        setUserOptions(users);

        wsCleanupRef.current?.();
        wsCleanupRef.current = createWsRankSubscription({
          slotId,
          roomId: dashboardData.room.id,
          onConnected: () => setWsConnected(true),
          onDisconnected: () => setWsConnected(false),
          onRankUpdated: (rank) => {
            setDashboard(rankToDashboard(rank));
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
        loadDashboard();
      }, 15000);
    });
  });

  useUnload(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    wsCleanupRef.current?.();
    wsCleanupRef.current = null;
    setWsConnected(false);
  });

  const pickUserFromActionSheet = async (options: UserVO[], title: string) => {
    if (options.length === 0) {
      throw new Error('当前没有可选用户');
    }

    const itemList = options.map((item) => `${item.nickname} · ${item.id.slice(0, 8)}`);

    try {
      const result = await Taro.showActionSheet({
        alertText: title,
        itemList,
      });

      const selected = options[result.tapIndex];
      if (!selected) {
        throw new Error('未选择用户');
      }

      return selected;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('cancel')) {
        return null;
      }
      throw error;
    }
  };

  const handlePickManualUser = async () => {
    try {
      const selected = await pickUserFromActionSheet(userOptions, '选择手动加榜用户');
      if (!selected) return;
      setManualUserId(selected.id);
      showSuccess(`已选择：${selected.nickname}`);
    } catch (error) {
      showError(error);
    }
  };

  const handleManualAdd = async () => {
    let targetId = manualUserId;

    try {
      if (!targetId) {
        const selected = await pickUserFromActionSheet(userOptions, '选择手动加榜用户');
        if (!selected) return;
        targetId = selected.id;
        setManualUserId(selected.id);
      }

      const result = await sdk.rank.manualAdd(slotId, {
        userId: targetId,
        sourceContent: '手动加麦',
        score: 999,
      });
      setDashboard(rankToDashboard(result.currentRank));
      showSuccess('手动加榜成功');
    } catch (error) {
      showError(error);
    }
  };

  const handleInvalidate = async (entryId: string) => {
    try {
      const result = await sdk.rank.invalidateEntry(slotId, { entryId });
      setDashboard(rankToDashboard(result.currentRank));
      showSuccess('已作废');
    } catch (error) {
      showError(error);
    }
  };

  const handleTransfer = async (entry: RankEntryVO) => {
    try {
      const candidates = userOptions.filter((item) => item.id !== entry.userId);
      const selected = await pickUserFromActionSheet(candidates, `转麦给谁？（当前：${entry.user?.nickname || entry.userId}）`);
      if (!selected) return;

      const result = await sdk.rank.transferEntry(slotId, {
        entryId: entry.id,
        toUserId: selected.id,
      });
      setDashboard(rankToDashboard(result.currentRank));
      showSuccess(`转麦成功 → ${selected.nickname}`);
    } catch (error) {
      showError(error);
    }
  };

  const handleCloseSpeed = async () => {
    try {
      await sdk.slots.closeSpeedStage(slotId);
      await loadDashboard();
      showSuccess('已提前截手速');
    } catch (error) {
      showError(error);
    }
  };

  const handleCloseFinal = async () => {
    try {
      await sdk.slots.closeFinalStage(slotId);
      await loadDashboard();
      showSuccess('已关闭最终报名');
    } catch (error) {
      showError(error);
    }
  };

  const handleToggleAdd = async (enabled: boolean) => {
    try {
      await sdk.slots.toggleAddStage(slotId, { enabled });
      await loadDashboard();
      showSuccess(enabled ? '已开启补排' : '已关闭补排');
    } catch (error) {
      showError(error);
    }
  };

  const handleReset = async () => {
    try {
      const result = await sdk.rank.resetSlot(slotId);
      setDashboard(rankToDashboard(result.currentRank));
      showSuccess('已重置本档');
    } catch (error) {
      showError(error);
    }
  };

  if (!dashboard) {
    return <View className='container'>加载中...</View>;
  }

  return (
    <View className='container'>
      <View className='card'>
        <View className='title'>主持控制台</View>
        <Text className='subtitle'>当前主持：{buildUserLabel(currentUser)}</Text>
        <View className='subtitle'>{dashboard.room.name}</View>
        <View className='subtitle'>当前状态：{dashboard.summary.state}</View>
        <View className='subtitle'>总人数：{dashboard.summary.totalEntries}</View>
        <View className='subtitle'>用户池：{userOptions.length} 人</View>
        <View className='subtitle'>实时刷新：{wsConnected ? 'WebSocket 已连接' : '轮询兜底中'}</View>
        <View className='btn-row action-group'>
          <Button onClick={() => Taro.navigateTo({ url: `/pages/ops/management/index?slotId=${slotId}&roomId=${dashboard.room.id}` })}>
            打开运营控制台
          </Button>
        </View>
      </View>

      <View className='card'>
        <View className='title'>档期控制</View>
        <View className='btn-row action-group'>
          <Button className='primary-btn' onClick={handleCloseSpeed}>提前截手速</Button>
          <Button onClick={handleCloseFinal}>关闭最终报名</Button>
          <Button onClick={() => handleToggleAdd(true)}>开启补排</Button>
          <Button onClick={() => handleToggleAdd(false)}>关闭补排</Button>
          <Button className='danger-btn' onClick={handleReset}>重置本档</Button>
        </View>
      </View>

      <View className='card'>
        <View className='title'>暂离报备监控</View>
        <View className='subtitle'>当前暂离人数：{leaveSnapshot?.activeNotices.length || 0}</View>
        {(leaveSnapshot?.activeNotices || []).length === 0 ? (
          <View className='subtitle'>暂无暂离报备</View>
        ) : (
          (leaveSnapshot?.activeNotices || []).map((item) => (
            <View className='leave-row' key={item.id}>
              <View>{item.user?.nickname || item.userId}</View>
              <View className='subtitle'>最晚回厅：{new Date(item.returnDeadline).toLocaleTimeString()}</View>
            </View>
          ))
        )}
      </View>

      <View className='card'>
        <View className='title'>手动操作（用户选择器）</View>
        <View className='subtitle'>当前选择：{manualUser ? `${manualUser.nickname} (${manualUser.id.slice(0, 8)})` : '未选择'}</View>
        <View className='btn-row action-group'>
          <Button onClick={handlePickManualUser}>选择用户</Button>
          <Button className='success-btn' onClick={handleManualAdd}>手动加榜</Button>
        </View>
      </View>

      <View className='card'>
        <View className='title'>当前榜单（含转麦弹层）</View>
        {dashboard.entries.map((item) => (
          <View className='card' key={item.id}>
            <View>No.{item.rank} · {item.user?.nickname || item.userId}</View>
            <View className='subtitle'>{item.sourceContent} / {item.score}</View>
            <View className='btn-row action-group'>
              <Button onClick={() => handleTransfer(item)}>转麦</Button>
              <Button className='danger-btn' onClick={() => handleInvalidate(item.id)}>作废</Button>
            </View>
          </View>
        ))}
      </View>

      <Button onClick={loadDashboard}>刷新主持台</Button>
    </View>
  );
}
