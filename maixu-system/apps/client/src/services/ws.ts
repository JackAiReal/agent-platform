import { io, Socket } from 'socket.io-client';
import type { LeaveNoticeSnapshotVO, RankResponseVO } from '@maixu/frontend-sdk';
import { WS_BASE_URL } from './sdk';

const WS_NAMESPACE_PATH = '/ws';

type RankUpdatedHandler = (rank: RankResponseVO) => void;
type LeaveNoticeUpdatedHandler = (snapshot: LeaveNoticeSnapshotVO) => void;

export function createWsRankSubscription(options: {
  slotId: string;
  roomId?: string;
  onRankUpdated: RankUpdatedHandler;
  onLeaveNoticeUpdated?: LeaveNoticeUpdatedHandler;
  onConnected?: () => void;
  onDisconnected?: () => void;
}) {
  const socket: Socket = io(`${WS_BASE_URL}${WS_NAMESPACE_PATH}`, {
    transports: ['websocket'],
    timeout: 5000,
  });

  const handleConnect = () => {
    if (options.roomId) {
      socket.emit('room:subscribe', { roomId: options.roomId });
    }
    socket.emit('slot:subscribe', { slotId: options.slotId });
    options.onConnected?.();
  };

  const handleRankUpdated = (payload: RankResponseVO) => {
    if (!payload?.slot?.id) return;
    if (payload.slot.id !== options.slotId) return;
    options.onRankUpdated(payload);
  };

  const handleLeaveNoticeUpdated = (payload: LeaveNoticeSnapshotVO) => {
    if (!payload?.slotId) return;
    if (payload.slotId !== options.slotId) return;
    options.onLeaveNoticeUpdated?.(payload);
  };

  const handleDisconnect = () => {
    options.onDisconnected?.();
  };

  socket.on('connect', handleConnect);
  socket.on('disconnect', handleDisconnect);
  socket.on('rank.updated', handleRankUpdated);
  socket.on('leave-notice.updated', handleLeaveNoticeUpdated);

  return () => {
    socket.off('connect', handleConnect);
    socket.off('disconnect', handleDisconnect);
    socket.off('rank.updated', handleRankUpdated);
    socket.off('leave-notice.updated', handleLeaveNoticeUpdated);
    socket.disconnect();
  };
}
