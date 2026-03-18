import { ScrollView, Switch, Text, View } from '@tarojs/components';
import Taro, { getCurrentInstance, useDidShow } from '@tarojs/taro';
import { useMemo, useState } from 'react';
import type { RoomDetailVO, UserVO } from '@maixu/frontend-sdk';
import { getCurrentUser, sdk } from '../../../services/sdk';
import { requireLogin } from '../../../services/auth';
import { showError } from '../../../utils/message';
import './index.scss';

type GroupSettings = {
  mute: boolean;
  fold: boolean;
  pin: boolean;
  saveContact: boolean;
  showNick: boolean;
};

const DEFAULT_MEMBER_NAMES = [
  '兔兔总管',
  '曜',
  'Pain',
  '爱看看',
  '大头',
  '一路生花',
  '苞米',
  '叔生',
  '二四',
  '三岁',
  '弃',
  '拽拽',
  '慕斯大王',
  '沈陆',
  '富',
  '方缘',
  '森',
  '可爱诺',
  '云野',
  '木白',
];

const ROOM_UI_FLAGS_KEY = 'maixu_room_ui_flags';

function resolveRoomId() {
  const fromRouter = getCurrentInstance().router?.params?.roomId;
  if (fromRouter) return fromRouter;

  if (typeof window !== 'undefined') {
    const hash = window.location.hash || '';
    const query = hash.includes('?') ? hash.split('?')[1] : '';
    return new URLSearchParams(query).get('roomId') || '';
  }

  return '';
}

function settingsStorageKey(roomId: string) {
  return `maixu_group_settings_${roomId}`;
}

function readSettings(roomId: string): GroupSettings {
  const defaults: GroupSettings = {
    mute: true,
    fold: true,
    pin: false,
    saveContact: false,
    showNick: true,
  };

  if (!roomId) return defaults;

  try {
    const saved = Taro.getStorageSync(settingsStorageKey(roomId)) as Partial<GroupSettings> | undefined;
    if (!saved || typeof saved !== 'object') return defaults;
    return { ...defaults, ...saved };
  } catch {
    return defaults;
  }
}

function saveSettings(roomId: string, next: GroupSettings) {
  if (!roomId) return;
  Taro.setStorageSync(settingsStorageKey(roomId), next);
}

function updateRoomPinFlag(roomId: string, pinned: boolean) {
  if (!roomId) return;

  const raw = (Taro.getStorageSync(ROOM_UI_FLAGS_KEY) || {}) as Record<string, Record<string, unknown>>;
  const next = {
    ...raw,
    [roomId]: {
      ...(raw[roomId] || {}),
      pinned,
    },
  };
  Taro.setStorageSync(ROOM_UI_FLAGS_KEY, next);
}

function buildMemberList(seedNames: string[], currentUser?: UserVO) {
  const list = [...seedNames];
  if (currentUser?.nickname) {
    list.unshift(currentUser.nickname);
  }
  return Array.from(new Set(list)).slice(0, 25);
}

export default function GroupInfoPage() {
  const roomId = resolveRoomId();
  const currentUser = getCurrentUser<UserVO>();

  const [room, setRoom] = useState<RoomDetailVO | null>(null);
  const [members, setMembers] = useState<string[]>(() => buildMemberList(DEFAULT_MEMBER_NAMES, currentUser));
  const [settings, setSettings] = useState<GroupSettings>(() => readSettings(roomId));

  useDidShow(() => {
    if (!roomId) return;

    requireLogin(`/pages/rooms/group-info/index?roomId=${roomId}`).then(async (user) => {
      if (!user) return;

      try {
        const roomDetail = await sdk.rooms.detail(roomId);
        setRoom(roomDetail);

        const rankData = await sdk.slots.rank(roomDetail.currentSlot.id);
        const rankNames = rankData.entries.map((entry) => entry.user?.nickname || entry.userId.slice(0, 4));
        const merged = Array.from(new Set([...DEFAULT_MEMBER_NAMES, ...rankNames, user.nickname]));
        setMembers(merged.slice(0, 25));
      } catch (error) {
        showError(error);
      }
    });
  });

  const memberCount = useMemo(() => Math.max(61, members.length), [members.length]);

  const updateSetting = (key: keyof GroupSettings, checked: boolean) => {
    const next = {
      ...settings,
      [key]: checked,
    };
    setSettings(next);
    saveSettings(roomId, next);

    if (key === 'pin') {
      updateRoomPinFlag(roomId, checked);
    }
  };

  const chatName = room ? `${room.name}排麦群🚫闲聊` : '排麦群🚫闲聊';

  return (
    <View className='group-info-page'>
      <View className='group-topbar'>
        <View className='top-back' onClick={() => Taro.navigateBack()}>‹</View>
        <Text className='top-title'>聊天信息({memberCount})</Text>
        <Text className='top-extra'>◌</Text>
      </View>

      <ScrollView className='group-scroll' scrollY>
        <View className='group-card members-card'>
          <View className='member-grid'>
            {members.slice(0, 20).map((name) => (
              <View className='member-item' key={name}>
                <View className='member-avatar'>{name.slice(0, 1)}</View>
                <Text className='member-name'>{name}</Text>
              </View>
            ))}

            <View className='member-item'>
              <View className='member-add'>＋</View>
            </View>
          </View>

          <View className='more-members'>查看更多群成员 ›</View>
        </View>

        <View className='group-card'>
          <View className='row with-arrow'>
            <Text className='row-label'>群聊名称</Text>
            <View className='row-value-wrap'>
              <Text className='row-value'>{chatName}</Text>
              <Text className='row-arrow'>›</Text>
            </View>
          </View>

          <View className='row with-arrow'>
            <Text className='row-label'>群二维码</Text>
            <View className='row-value-wrap'>
              <Text className='row-value'>⌗⌗</Text>
              <Text className='row-arrow'>›</Text>
            </View>
          </View>

          <View className='row with-arrow multiline'>
            <Text className='row-label'>群公告</Text>
            <View className='row-value-wrap'>
              <Text className='row-value multiline-text'>
                😂 置顶规则\n1️⃣ 新人一周内 7 张新人置顶卡\n2️⃣ 周魅力 6000+ 排名发粉牛置顶 1 张
              </Text>
              <Text className='row-arrow'>›</Text>
            </View>
          </View>

          <View className='row with-arrow'>
            <Text className='row-label'>备注</Text>
            <View className='row-value-wrap'>
              <Text className='row-value'> </Text>
              <Text className='row-arrow'>›</Text>
            </View>
          </View>
        </View>

        <View className='group-card'>
          <View className='row with-arrow'>
            <Text className='row-label'>查找聊天记录</Text>
            <Text className='row-arrow'>›</Text>
          </View>

          <View className='row switch-row'>
            <Text className='row-label'>消息免打扰</Text>
            <Switch checked={settings.mute} color='#35c759' onChange={(e) => updateSetting('mute', e.detail.value)} />
          </View>

          <View className='row switch-row'>
            <Text className='row-label'>折叠该聊天</Text>
            <Switch checked={settings.fold} color='#35c759' onChange={(e) => updateSetting('fold', e.detail.value)} />
          </View>

          <View className='row with-arrow'>
            <Text className='row-label'>关注的群成员</Text>
            <Text className='row-arrow'>›</Text>
          </View>

          <View className='row switch-row'>
            <Text className='row-label'>置顶聊天</Text>
            <Switch checked={settings.pin} color='#35c759' onChange={(e) => updateSetting('pin', e.detail.value)} />
          </View>

          <View className='row switch-row'>
            <Text className='row-label'>保存到通讯录</Text>
            <Switch
              checked={settings.saveContact}
              color='#35c759'
              onChange={(e) => updateSetting('saveContact', e.detail.value)}
            />
          </View>
        </View>

        <View className='group-card'>
          <View className='row with-arrow'>
            <Text className='row-label'>我在群里的昵称</Text>
            <View className='row-value-wrap'>
              <Text className='row-value'>{currentUser?.nickname || '一路生花'}</Text>
              <Text className='row-arrow'>›</Text>
            </View>
          </View>

          <View className='row switch-row'>
            <Text className='row-label'>显示群成员昵称</Text>
            <Switch
              checked={settings.showNick}
              color='#35c759'
              onChange={(e) => updateSetting('showNick', e.detail.value)}
            />
          </View>
        </View>

        <View className='group-card'>
          <View className='row with-arrow'>
            <Text className='row-label'>设置当前聊天背景</Text>
            <Text className='row-arrow'>›</Text>
          </View>

          <View className='row with-arrow'>
            <Text className='row-label'>清空聊天记录</Text>
            <Text className='row-arrow'>›</Text>
          </View>

          <View className='row with-arrow'>
            <Text className='row-label'>投诉</Text>
            <Text className='row-arrow'>›</Text>
          </View>
        </View>

        <View className='group-card exit-card'>退出群聊</View>
      </ScrollView>
    </View>
  );
}
