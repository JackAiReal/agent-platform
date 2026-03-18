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
  unread?: boolean;
  hidden?: boolean;
  deleted?: boolean;
};

const ROOM_UI_FLAGS_KEY = 'maixu_room_ui_flags';

function readRoomUiFlags(): Record<string, RoomUiFlags> {
  try {
    const raw = Taro.getStorageSync(ROOM_UI_FLAGS_KEY) as Record<string, RoomUiFlags> | undefined;
    if (raw && typeof raw === 'object') return raw;
  } catch {
    // ignore
  }
  return {};
}

function formatSlotTime(hour: number) {
  return `${String(hour).padStart(2, '0')}:00`;
}

function buildRoomPreview(room: RoomListItemVO) {
  if (room.currentRankCount > 0) {
    return `麦序机器人：当前 ${room.currentRankCount} 人排麦，发“排麦 手速”即可上麦`;
  }
  return '麦序机器人：当前空麦，发“排麦 手速”开始排麦';
}

export default function RoomsPage() {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [rooms, setRooms] = useState<RoomListItemVO[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [menuRoom, setMenuRoom] = useState<RoomListItemVO | null>(null);
  const [currentUser, setCurrentUserState] = useState<UserVO | undefined>(() => getCurrentUser<UserVO>());
  const [roomUiFlags, setRoomUiFlags] = useState<Record<string, RoomUiFlags>>(() => readRoomUiFlags());

  const updateRoomUiFlags = (roomId: string, patch: RoomUiFlags) => {
    setRoomUiFlags((prev) => {
      const next = {
        ...prev,
        [roomId]: {
          ...(prev[roomId] || {}),
          ...patch,
        },
      };
      Taro.setStorageSync(ROOM_UI_FLAGS_KEY, next);
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

  const filteredRooms = useMemo(() => {
    const q = keyword.trim().toLowerCase();

    return [...rooms]
      .filter((room) => {
        const flag = roomUiFlags[room.id];
        return !flag?.hidden && !flag?.deleted;
      })
      .filter((room) => {
        if (!q) return true;
        return `${room.name} ${room.description || ''}`.toLowerCase().includes(q);
      })
      .sort((a, b) => {
        const pinA = roomUiFlags[a.id]?.pinned ? 1 : 0;
        const pinB = roomUiFlags[b.id]?.pinned ? 1 : 0;
        if (pinA !== pinB) return pinB - pinA;
        return b.currentRankCount - a.currentRankCount;
      });
  }, [rooms, keyword, roomUiFlags]);

  const handleOpenRoom = (room: RoomListItemVO) => {
    updateRoomUiFlags(room.id, { unread: false });
    Taro.navigateTo({ url: `/pages/rooms/detail/index?roomId=${room.id}` });
  };

  const handleLongPressRoom = (room: RoomListItemVO) => {
    setMenuRoom(room);
  };

  const closeMenu = () => {
    setMenuRoom(null);
  };

  const handleMenuAction = async (action: 'unread' | 'pin' | 'hide' | 'delete') => {
    if (!menuRoom) return;

    const currentFlag = roomUiFlags[menuRoom.id] || {};

    if (action === 'unread') {
      updateRoomUiFlags(menuRoom.id, { unread: !currentFlag.unread });
      closeMenu();
      return;
    }

    if (action === 'pin') {
      updateRoomUiFlags(menuRoom.id, { pinned: !currentFlag.pinned });
      closeMenu();
      return;
    }

    if (action === 'hide') {
      updateRoomUiFlags(menuRoom.id, { hidden: true });
      closeMenu();
      return;
    }

    const modal = await Taro.showModal({
      title: '删除该聊天',
      content: `确认删除“${menuRoom.name}”吗？`,
      confirmColor: '#ef4444',
    });

    if (!modal.confirm) return;

    updateRoomUiFlags(menuRoom.id, { deleted: true });
    closeMenu();
  };

  const handleHeaderMore = async () => {
    const { tapIndex } = await Taro.showActionSheet({
      itemList: ['刷新聊天列表', '打开运营台', '退出登录'],
    });

    if (tapIndex === 0) {
      loadRooms();
      return;
    }

    if (tapIndex === 1) {
      Taro.navigateTo({ url: '/pages/ops/management/index' });
      return;
    }

    if (tapIndex === 2) {
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
          <View className='nav-icon' onClick={handleHeaderMore}>＋</View>
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
          const unreadCount = roomFlag.unread ? 1 : room.currentRankCount;

          return (
            <View
              className='chat-item'
              key={room.id}
              onClick={() => handleOpenRoom(room)}
              onLongPress={() => handleLongPressRoom(room)}
            >
              <View className='chat-avatar'>{room.name.slice(0, 1)}</View>

              <View className='chat-main'>
                <View className='chat-top'>
                  <Text className='chat-name'>
                    {roomFlag.pinned ? '📌 ' : ''}
                    {room.name}
                  </Text>
                  <Text className='chat-time'>{formatSlotTime(room.currentSlot.slotHour)}</Text>
                </View>

                <View className='chat-bottom'>
                  <Text className='chat-preview'>{buildRoomPreview(room)}</Text>
                  {room.currentRankCount === 0 ? <Text className='chat-mute'>🔕</Text> : null}
                </View>
              </View>

              {unreadCount > 0 ? <View className='chat-unread'>{Math.min(unreadCount, 99)}</View> : null}
            </View>
          );
        })}

        {!filteredRooms.length ? (
          <View className='empty-state'>
            <Text>没有聊天记录</Text>
          </View>
        ) : null}
      </View>

      <View className='wechat-tabbar'>
        <View className='tab-item active'>
          <View className='tab-icon'>💬</View>
          <Text className='tab-label'>微信</Text>
        </View>
        <View className='tab-item'>
          <View className='tab-icon'>👥</View>
          <Text className='tab-label'>通讯录</Text>
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
          <View className='context-menu' onClick={(e) => e.stopPropagation()}>
            <View className='context-item' onClick={() => handleMenuAction('unread')}>
              {(roomUiFlags[menuRoom.id]?.unread ? '标为已读' : '标为未读')}
            </View>
            <View className='context-item' onClick={() => handleMenuAction('pin')}>
              {roomUiFlags[menuRoom.id]?.pinned ? '取消置顶' : '置顶该聊天'}
            </View>
            <View className='context-item' onClick={() => handleMenuAction('hide')}>不显示该聊天</View>
            <View className='context-item danger' onClick={() => handleMenuAction('delete')}>删除该聊天</View>
          </View>
        </View>
      ) : null}

      <View className='whoami'>当前账号：{buildUserLabel(currentUser)}</View>
    </View>
  );
}
