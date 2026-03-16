import { Button, Input, Text, View } from '@tarojs/components';
import Taro, { getCurrentInstance, useDidShow } from '@tarojs/taro';
import { useState } from 'react';
import type { HostDashboardVO } from '@maixu/frontend-sdk';
import { sdk } from '../../../services/sdk';
import { showError, showSuccess } from '../../../utils/message';
import './index.scss';

export default function HostDashboardPage() {
  const slotId = getCurrentInstance().router?.params?.slotId || '';
  const [dashboard, setDashboard] = useState<HostDashboardVO | null>(null);
  const [manualUserId, setManualUserId] = useState('');
  const [transferTargetId, setTransferTargetId] = useState('');

  const loadDashboard = async () => {
    try {
      const data = await sdk.slots.hostDashboard(slotId);
      setDashboard(data);
    } catch (error) {
      showError(error);
    }
  };

  useDidShow(() => {
    if (slotId) {
      loadDashboard();
    }
  });

  const firstEntryId = dashboard?.entries[0]?.id;

  const handleManualAdd = async () => {
    if (!manualUserId.trim()) return;
    try {
      const result = await sdk.rank.manualAdd(slotId, {
        userId: manualUserId.trim(),
        sourceContent: '手动加麦',
        score: 999,
      });
      setDashboard({
        slot: result.currentRank.slot,
        room: result.currentRank.room,
        summary: {
          totalEntries: result.currentRank.entries.length,
          topCount: result.currentRank.topEntries.length,
          maxRank: result.currentRank.maxRank,
          state: result.currentRank.slot.state,
          isFull: result.currentRank.slot.isFull,
        },
        entries: result.currentRank.entries,
        topEntries: result.currentRank.topEntries,
      });
      showSuccess('手动加榜成功');
    } catch (error) {
      showError(error);
    }
  };

  const handleInvalidate = async (entryId: string) => {
    try {
      const result = await sdk.rank.invalidateEntry(slotId, { entryId });
      setDashboard({
        slot: result.currentRank.slot,
        room: result.currentRank.room,
        summary: {
          totalEntries: result.currentRank.entries.length,
          topCount: result.currentRank.topEntries.length,
          maxRank: result.currentRank.maxRank,
          state: result.currentRank.slot.state,
          isFull: result.currentRank.slot.isFull,
        },
        entries: result.currentRank.entries,
        topEntries: result.currentRank.topEntries,
      });
      showSuccess('已作废');
    } catch (error) {
      showError(error);
    }
  };

  const handleTransfer = async () => {
    if (!firstEntryId || !transferTargetId.trim()) return;
    try {
      const result = await sdk.rank.transferEntry(slotId, {
        entryId: firstEntryId,
        toUserId: transferTargetId.trim(),
      });
      setDashboard({
        slot: result.currentRank.slot,
        room: result.currentRank.room,
        summary: {
          totalEntries: result.currentRank.entries.length,
          topCount: result.currentRank.topEntries.length,
          maxRank: result.currentRank.maxRank,
          state: result.currentRank.slot.state,
          isFull: result.currentRank.slot.isFull,
        },
        entries: result.currentRank.entries,
        topEntries: result.currentRank.topEntries,
      });
      showSuccess('转麦成功');
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
      setDashboard({
        slot: result.currentRank.slot,
        room: result.currentRank.room,
        summary: {
          totalEntries: result.currentRank.entries.length,
          topCount: result.currentRank.topEntries.length,
          maxRank: result.currentRank.maxRank,
          state: result.currentRank.slot.state,
          isFull: result.currentRank.slot.isFull,
        },
        entries: result.currentRank.entries,
        topEntries: result.currentRank.topEntries,
      });
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
        <Text className='subtitle'>{dashboard.room.name}</Text>
        <View className='subtitle'>当前状态：{dashboard.summary.state}</View>
        <View className='subtitle'>总人数：{dashboard.summary.totalEntries}</View>
      </View>

      <View className='card'>
        <View className='title'>档期控制</View>
        <View className='btn-row action-group'>
          <Button className='primary-btn' onClick={handleCloseSpeed}>提前截手速</Button>
          <Button onClick={() => handleToggleAdd(true)}>开启补排</Button>
          <Button onClick={() => handleToggleAdd(false)}>关闭补排</Button>
          <Button className='danger-btn' onClick={handleReset}>重置本档</Button>
        </View>
      </View>

      <View className='card'>
        <View className='title'>手动操作</View>
        <Input className='input-line' placeholder='手动加榜 userId' value={manualUserId} onInput={(e) => setManualUserId(e.detail.value)} />
        <View className='btn-row action-group'>
          <Button className='success-btn' onClick={handleManualAdd}>手动加榜</Button>
        </View>

        <Input className='input-line' placeholder='转麦目标 userId（默认转榜首）' value={transferTargetId} onInput={(e) => setTransferTargetId(e.detail.value)} />
        <View className='btn-row action-group'>
          <Button onClick={handleTransfer}>转麦（榜首）</Button>
        </View>
      </View>

      <View className='card'>
        <View className='title'>当前榜单</View>
        {dashboard.entries.map((item) => (
          <View className='card' key={item.id}>
            <View>No.{item.rank} · {item.user?.nickname || item.userId}</View>
            <View className='subtitle'>{item.sourceContent} / {item.score}</View>
            <View className='btn-row action-group'>
              <Button className='danger-btn' onClick={() => handleInvalidate(item.id)}>作废</Button>
            </View>
          </View>
        ))}
      </View>

      <Button onClick={loadDashboard}>刷新主持台</Button>
    </View>
  );
}
