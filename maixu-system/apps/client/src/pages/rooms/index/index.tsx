import { Input, Text, View } from '@tarojs/components';
import Taro, { useDidShow, useUnload } from '@tarojs/taro';
import { useMemo, useRef, useState } from 'react';
import type { RoomListItemVO, UserVO } from '@maixu/frontend-sdk';
import { buildUserLabel, clearSession, requireLogin } from '../../../services/auth';
import { getCurrentUser, sdk } from '../../../services/sdk';
import { showError } from '../../../utils/message';
import './index.scss';

type RoomUiFlags = {
  pinned?: boolean;
  manualUnread?: boolean;
  hidden?: boolean;
  deleted?: boolean;
  deletedAt?: number;
};

const ROOM_UI_FLAGS_KEY = 'maixu_room_ui_flags';
const AVATAR_CELLS = Array.from({ length: 9 }, (_, index) => index);
const AVATAR_EMOJIS = ['🌌', '🏞️', '🎧', '🛰️', '🌙', '🍃', '🧊', '☄️', '🎵', '🪐', '📷', '🐾'];

function readRoomUiFlags(): Record<string, RoomUiFlags> {
  try {
    const raw = Taro.getStorageSync(ROOM_UI_FLAGS_KEY) as Record<string, RoomUiFlags> | undefined;
    if (raw && typeof raw === 'object') return raw;
  } catch {
    // ignore
  }
  return {};
}

function getRoomHash(room: RoomListItemVO) {
  return `${room.id}${room.name}`.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
}

function formatMessageTime(hour: number) {
  return `${String(hour).padStart(2, '0')}:00`;
}

function buildDisplayName(room: RoomListItemVO) {
  const roomName = room.name.trim();
  if (/排麦/.test(roomName)) return roomName;
  return `${roomName}排麦群`;
}

function buildAnnouncement(room: RoomListItemVO) {
  const slotHour = room.currentSlot.slotHour;
  const endHour = (slotHour + 1) % 24;
  const rankText = room.currentRankCount > 0 ? `当前排麦 ${room.currentRankCount} 人` : '当前空麦可直接报名';
  return `${rankText} 时间：${slotHour} - ${endHour}`;
}

function getAvatarEmoji(room: RoomListItemVO, index: number) {
  const hash = getRoomHash(room);
  return AVATAR_EMOJIS[(hash + index * 7) % AVATAR_EMOJIS.length];
}

export default function RoomsPage() {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [rooms, setRooms] = useState<RoomListItemVO[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [showHiddenRooms, setShowHiddenRooms] = useState(false);
  const [menuRoom, setMenuRoom] = useState<RoomListItemVO | null>(null);
  const [menuTop, setMenuTop] = useState(300);
  const [currentUser, setCurrentUserState] = useState<UserVO | undefined>(() => getCurrentUser<UserVO>());
  const [roomUiFlags, setRoomUiFlags] = useState<Record<string, RoomUiFlags>>(() => readRoomUiFlags());

  const persistFlags = (next: Record<string, RoomUiFlags>) => {
    Taro.setStorageSync(ROOM_UI_FLAGS_KEY, next);
  };

  const updateRoomUiFlags = (roomId: string, patch: Partial<RoomUiFlags>) => {
    setRoomUiFlags((prev) => {
      const next = {
        ...prev,
        [roomId]: {
          ...(prev[roomId] || {}),
          ...patch,
        },
      };
      persistFlags(next);
      return next;
    });
  };

  const updateFlagsBatch = (updater: (prev: Record<string, RoomUiFlags>) => Record<string, RoomUiFlags>) => {
    setRoomUiFlags((prev) => {
      const next = updater(prev);
      persistFlags(next);
      return next;
    });
  };

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

  const hiddenCount = useMemo(
    () => Object.values(roomUiFlags).filter((flag) => flag.hidden && !flag.deleted).length,
    [roomUiFlags],
  );

  const deletedCount = useMemo(
    () => Object.values(roomUiFlags).filter((flag) => flag.deleted).length,
    [roomUiFlags],
  );

  const filteredRooms = useMemo(() => {
    const q = keyword.trim().toLowerCase();

    return [...rooms]
      .filter((room) => {
        const flag = roomUiFlags[room.id] || {};
        if (flag.deleted) return false;
        if (!showHiddenRooms && flag.hidden) return false;
        return true;
      })
      .filter((room) => {
        if (!q) return true;
        return `${room.name} ${room.description || ''}`.toLowerCase().includes(q);
      })
      .sort((a, b) => {
        const flagA = roomUiFlags[a.id] || {};
        const flagB = roomUiFlags[b.id] || {};

        const pinA = flagA.pinned ? 1 : 0;
        const pinB = flagB.pinned ? 1 : 0;
        if (pinA !== pinB) return pinB - pinA;

        const hiddenA = flagA.hidden ? 1 : 0;
        const hiddenB = flagB.hidden ? 1 : 0;
        if (hiddenA !== hiddenB) return hiddenA - hiddenB;

        return b.currentRankCount - a.currentRankCount;
      });
  }, [rooms, keyword, roomUiFlags, showHiddenRooms]);

  const handleOpenRoom = (room: RoomListItemVO) => {
    updateRoomUiFlags(room.id, { manualUnread: false });
    Taro.navigateTo({ url: `/pages/rooms/detail/index?roomId=${room.id}` });
  };

  const handleLongPressRoom = (room: RoomListItemVO, event: unknown) => {
    const touch = (event as { changedTouches?: Array<{ clientY?: number; pageY?: number }> })?.changedTouches?.[0];
    const y = touch?.clientY || touch?.pageY || 300;
    const { windowHeight } = Taro.getSystemInfoSync();

    setMenuTop(Math.max(150, Math.min(y - 80, windowHeight - 420)));
    setMenuRoom(room);
  };

  const closeMenu = () => {
    setMenuRoom(null);
  };

  const handleMenuAction = async (action: 'unread' | 'pin' | 'hide' | 'delete') => {
    if (!menuRoom) return;

    const currentFlag = roomUiFlags[menuRoom.id] || {};

    if (action === 'unread') {
      updateRoomUiFlags(menuRoom.id, { manualUnread: !currentFlag.manualUnread });
      Taro.showToast({
        title: currentFlag.manualUnread ? '已标为已读' : '已标为未读',
        icon: 'none',
      });
      closeMenu();
      return;
    }

    if (action === 'pin') {
      updateRoomUiFlags(menuRoom.id, { pinned: !currentFlag.pinned });
      Taro.showToast({
        title: currentFlag.pinned ? '已取消置顶' : '已置顶聊天',
        icon: 'none',
      });
      closeMenu();
      return;
    }

    if (action === 'hide') {
      updateRoomUiFlags(menuRoom.id, { hidden: !currentFlag.hidden });
      Taro.showToast({
        title: currentFlag.hidden ? '已恢复显示' : '已不显示该聊天',
        icon: 'none',
      });
      closeMenu();
      return;
    }

    const modal = await Taro.showModal({
      title: '删除该聊天',
      content: `确认删除“${buildDisplayName(menuRoom)}”吗？`,
      confirmColor: '#ef4444',
    });

    if (!modal.confirm) return;

    updateRoomUiFlags(menuRoom.id, {
      deleted: true,
      hidden: false,
      pinned: false,
      manualUnread: false,
      deletedAt: Date.now(),
    });
    Taro.showToast({ title: '已删除聊天', icon: 'none' });
    closeMenu();
  };

  const restoreHiddenChats = () => {
    updateFlagsBatch((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((roomId) => {
        if (next[roomId]?.hidden) {
          next[roomId] = { ...next[roomId], hidden: false };
        }
      });
      return next;
    });
    Taro.showToast({ title: '已恢复隐藏聊天', icon: 'none' });
  };

  const restoreLatestDeleted = () => {
    let latestRoomId = '';
    let latestDeletedAt = 0;

    Object.entries(roomUiFlags).forEach(([roomId, flag]) => {
      if (!flag.deleted) return;
      const deletedAt = flag.deletedAt || 0;
      if (deletedAt >= latestDeletedAt) {
        latestDeletedAt = deletedAt;
        latestRoomId = roomId;
      }
    });

    if (!latestRoomId) {
      Taro.showToast({ title: '暂无可恢复聊天', icon: 'none' });
      return;
    }

    updateRoomUiFlags(latestRoomId, {
      deleted: false,
      deletedAt: undefined,
    });
    Taro.showToast({ title: '已恢复最近删除聊天', icon: 'none' });
  };

  const handleHeaderMore = async () => {
    const itemList = [
      '刷新聊天列表',
      showHiddenRooms ? '隐藏已隐藏聊天' : '显示已隐藏聊天',
      hiddenCount ? '恢复全部隐藏聊天' : '无隐藏聊天',
      deletedCount ? '恢复最近删除聊天' : '无删除聊天',
      '打开运营台',
      '退出登录',
    ];

    const { tapIndex } = await Taro.showActionSheet({ itemList });

    if (tapIndex === 0) {
      loadRooms();
      return;
    }

    if (tapIndex === 1) {
      setShowHiddenRooms((prev) => !prev);
      return;
    }

    if (tapIndex === 2) {
      if (!hiddenCount) {
        Taro.showToast({ title: '暂无隐藏聊天', icon: 'none' });
        return;
      }
      restoreHiddenChats();
      return;
    }

    if (tapIndex === 3) {
      if (!deletedCount) {
        Taro.showToast({ title: '暂无删除聊天', icon: 'none' });
        return;
      }
      restoreLatestDeleted();
      return;
    }

    if (tapIndex === 4) {
      Taro.navigateTo({ url: '/pages/ops/management/index' });
      return;
    }

    if (tapIndex === 5) {
      clearSession();
      Taro.redirectTo({ url: '/pages/auth/login/index' });
    }
  };

  return (
    <View className='wechat-shell'>
      <View className='wechat-nav'>
        <View className='wechat-nav-title'>微信</View>
        <View className='wechat-nav-actions'>
          <View className='nav-icon' onClick={() => setShowSearch((prev) => !prev)}>⌕</View>
          <View className='nav-icon' onClick={handleHeaderMore}>{loading ? '…' : '＋'}</View>
        </View>
      </View>

      {showSearch ? (
        <View className='search-row'>
          <Input
            className='search-input'
            value={keyword}
            placeholder='搜索'
            onInput={(e) => setKeyword(e.detail.value)}
          />
        </View>
      ) : null}

      <View className='chat-list'>
        {filteredRooms.map((room) => {
          const roomFlag = roomUiFlags[room.id] || {};
          const unreadCount = room.currentRankCount > 0 ? room.currentRankCount : roomFlag.manualUnread ? 1 : 0;

          return (
            <View
              className={`chat-item ${roomFlag.pinned ? 'is-pinned' : ''} ${roomFlag.hidden ? 'is-hidden' : ''}`}
              key={room.id}
              onClick={() => handleOpenRoom(room)}
              onLongPress={(e) => handleLongPressRoom(room, e)}
            >
              <View className='chat-avatar-grid'>
                {AVATAR_CELLS.map((cell) => (
                  <View className='avatar-cell' key={cell}>
                    <Text className='avatar-emoji'>{getAvatarEmoji(room, cell)}</Text>
                  </View>
                ))}
                {unreadCount > 0 ? <View className='avatar-dot'>{unreadCount > 99 ? '99+' : unreadCount}</View> : null}
              </View>

              <View className='chat-main'>
                <View className='chat-top'>
                  <View className='chat-title-wrap'>
                    <Text className='chat-name'>{buildDisplayName(room)}</Text>
                    <Text className='chat-ban'>禁闲聊</Text>
                    {roomFlag.hidden ? <Text className='chat-tag-muted'>已隐藏</Text> : null}
                  </View>
                  <Text className='chat-time'>{formatMessageTime(room.currentSlot.slotHour)}</Text>
                </View>

                <View className='chat-bottom'>
                  <Text className='chat-notice-tag'>[群公告]</Text>
                  <Text className='chat-preview'>{buildAnnouncement(room)}</Text>
                </View>
              </View>

              <View className='chat-right-icon'>🔕</View>
            </View>
          );
        })}

        {!filteredRooms.length ? (
          <View className='empty-state'>
            <Text>{showHiddenRooms ? '暂无已隐藏聊天' : '没有聊天记录'}</Text>
          </View>
        ) : null}
      </View>

      <View className='wechat-tabbar'>
        <View className='tab-item active'>
          <View className='tab-icon'>💬</View>
          <Text className='tab-label'>微信</Text>
        </View>
        <View className='tab-item'>
          <View className='tab-icon'>🧭</View>
          <Text className='tab-label'>发现</Text>
        </View>
        <View className='tab-item'>
          <View className='tab-icon'>🙂</View>
          <Text className='tab-label'>我</Text>
        </View>
      </View>

      {menuRoom ? (
        <View className='context-mask' onClick={closeMenu} catchMove>
          <View className='context-menu' style={{ top: `${menuTop}px` }} onClick={(e) => e.stopPropagation()}>
            <View className='context-item' onClick={() => handleMenuAction('unread')}>
              {roomUiFlags[menuRoom.id]?.manualUnread ? '标为已读' : '标为未读'}
            </View>
            <View className='context-item' onClick={() => handleMenuAction('pin')}>
              {roomUiFlags[menuRoom.id]?.pinned ? '取消置顶' : '置顶该聊天'}
            </View>
            <View className='context-item' onClick={() => handleMenuAction('hide')}>
              {roomUiFlags[menuRoom.id]?.hidden ? '取消不显示' : '不显示该聊天'}
            </View>
            <View className='context-item danger' onClick={() => handleMenuAction('delete')}>删除该聊天</View>
            <View className='context-item cancel' onClick={closeMenu}>取消</View>
          </View>
        </View>
      ) : null}

      <View className='whoami'>当前账号：{buildUserLabel(currentUser)}</View>
    </View>
  );
}
