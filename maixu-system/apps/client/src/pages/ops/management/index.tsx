import { Button, Input, Text, View } from '@tarojs/components';
import Taro, { getCurrentInstance, useDidShow } from '@tarojs/taro';
import { useMemo, useState } from 'react';
import type {
  AuditLogVO,
  HostOverrideVO,
  HostScheduleVO,
  NotificationLogVO,
  RoomConfigSnapshotVO,
  UserVO,
} from '@maixu/frontend-sdk';
import { requireLogin } from '../../../services/auth';
import { sdk } from '../../../services/sdk';
import { showError, showSuccess } from '../../../utils/message';
import './index.scss';

type OpsTabKey = 'configs' | 'schedules' | 'overrides' | 'notifications' | 'audit';

const TAB_OPTIONS: Array<{ key: OpsTabKey; label: string }> = [
  { key: 'configs', label: '房间配置' },
  { key: 'schedules', label: '主持排班' },
  { key: 'overrides', label: '临时主持' },
  { key: 'notifications', label: '通知日志' },
  { key: 'audit', label: '审计日志' },
];

const PAGE_SIZE = {
  schedules: 5,
  overrides: 5,
  notifications: 8,
  audit: 8,
};

function todayDateStr() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function includesKeyword(keyword: string, parts: Array<string | undefined | null>) {
  if (!keyword.trim()) return true;
  const kw = keyword.trim().toLowerCase();
  return parts.some((part) => String(part || '').toLowerCase().includes(kw));
}

function paginate<T>(items: T[], page: number, pageSize: number) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(Math.max(page, 1), totalPages);
  const start = (currentPage - 1) * pageSize;
  return {
    totalPages,
    currentPage,
    pageItems: items.slice(start, start + pageSize),
  };
}

export default function OpsManagementPage() {
  const params = getCurrentInstance().router?.params || {};
  const initialSlotId = params.slotId || '';
  const initialRoomId = params.roomId || '';

  const [activeTab, setActiveTab] = useState<OpsTabKey>('configs');

  const [roomId, setRoomId] = useState(initialRoomId);
  const [slotId, setSlotId] = useState(initialSlotId);
  const [roomName, setRoomName] = useState('');

  const [configSnapshot, setConfigSnapshot] = useState<RoomConfigSnapshotVO | null>(null);
  const [maxRank, setMaxRank] = useState('7');
  const [orderStartMinute, setOrderStartMinute] = useState('0');
  const [orderStopMinute, setOrderStopMinute] = useState('10');
  const [challengeTtlSeconds, setChallengeTtlSeconds] = useState('120');
  const [enableChallenge, setEnableChallenge] = useState(false);

  const [userOptions, setUserOptions] = useState<UserVO[]>([]);
  const userMap = useMemo(() => {
    const map = new Map<string, UserVO>();
    userOptions.forEach((u) => map.set(u.id, u));
    return map;
  }, [userOptions]);

  const [schedules, setSchedules] = useState<HostScheduleVO[]>([]);
  const [overrides, setOverrides] = useState<HostOverrideVO[]>([]);
  const [scheduleKeyword, setScheduleKeyword] = useState('');
  const [overrideKeyword, setOverrideKeyword] = useState('');
  const [schedulePage, setSchedulePage] = useState(1);
  const [overridePage, setOverridePage] = useState(1);

  const [scheduleWeekday, setScheduleWeekday] = useState(String(new Date().getDay()));
  const [scheduleStartHour, setScheduleStartHour] = useState(String(new Date().getHours()));
  const [scheduleEndHour, setScheduleEndHour] = useState(String(Math.min(new Date().getHours() + 1, 24)));
  const [scheduleHostUserId, setScheduleHostUserId] = useState('');
  const [schedulePriority, setSchedulePriority] = useState('0');

  const [overrideDate, setOverrideDate] = useState(todayDateStr());
  const [overrideHour, setOverrideHour] = useState(String(new Date().getHours()));
  const [overrideHostUserId, setOverrideHostUserId] = useState('');
  const [overrideRemark, setOverrideRemark] = useState('');
  const [resolveResult, setResolveResult] = useState<string>('');

  const [notificationLogs, setNotificationLogs] = useState<NotificationLogVO[]>([]);
  const [notificationKeyword, setNotificationKeyword] = useState('');
  const [notificationPage, setNotificationPage] = useState(1);
  const [notificationCheckResult, setNotificationCheckResult] = useState('');

  const [auditLogs, setAuditLogs] = useState<AuditLogVO[]>([]);
  const [auditKeyword, setAuditKeyword] = useState('');
  const [auditPage, setAuditPage] = useState(1);

  const scheduleFiltered = useMemo(
    () =>
      schedules.filter((item) =>
        includesKeyword(scheduleKeyword, [
          item.hostUser?.nickname,
          item.hostUserId,
          `周${item.weekday}`,
          `${item.startHour}-${item.endHour}`,
          `priority:${item.priority}`,
        ]),
      ),
    [schedules, scheduleKeyword],
  );
  const schedulePaged = useMemo(
    () => paginate(scheduleFiltered, schedulePage, PAGE_SIZE.schedules),
    [scheduleFiltered, schedulePage],
  );

  const overrideFiltered = useMemo(
    () =>
      overrides.filter((item) =>
        includesKeyword(overrideKeyword, [
          item.hostUser?.nickname,
          item.hostUserId,
          String(item.slotDate),
          `${item.slotHour}`,
          item.remark,
        ]),
      ),
    [overrides, overrideKeyword],
  );
  const overridePaged = useMemo(
    () => paginate(overrideFiltered, overridePage, PAGE_SIZE.overrides),
    [overrideFiltered, overridePage],
  );

  const notificationFiltered = useMemo(
    () =>
      notificationLogs.filter((item) =>
        includesKeyword(notificationKeyword, [item.templateCode, item.status, item.channel, item.userId]),
      ),
    [notificationLogs, notificationKeyword],
  );
  const notificationPaged = useMemo(
    () => paginate(notificationFiltered, notificationPage, PAGE_SIZE.notifications),
    [notificationFiltered, notificationPage],
  );

  const auditFiltered = useMemo(
    () =>
      auditLogs.filter((item) =>
        includesKeyword(auditKeyword, [item.action, item.operatorUserId, item.targetType, item.targetId]),
      ),
    [auditLogs, auditKeyword],
  );
  const auditPaged = useMemo(() => paginate(auditFiltered, auditPage, PAGE_SIZE.audit), [auditFiltered, auditPage]);

  const pickUser = async (title: string) => {
    if (userOptions.length === 0) {
      throw new Error('暂无可选用户');
    }

    const itemList = userOptions.map((item) => `${item.nickname} · ${item.id.slice(0, 8)}`);
    const result = await Taro.showActionSheet({
      alertText: title,
      itemList,
    });

    return userOptions[result.tapIndex];
  };

  const confirmDanger = async (title: string, content: string) => {
    const result = await Taro.showModal({
      title,
      content,
      confirmColor: '#dc2626',
      confirmText: '确认执行',
      cancelText: '取消',
    });

    return result.confirm;
  };

  const loadAll = async () => {
    try {
      let nextRoomId = roomId;
      let nextSlotId = slotId;
      let nextRoomName = roomName;

      if (!nextRoomId && !nextSlotId) {
        const rooms = await sdk.rooms.list();
        if (!rooms.length) throw new Error('没有可用房间');
        nextRoomId = rooms[0].id;
        nextSlotId = rooms[0].currentSlot.id;
        nextRoomName = rooms[0].name;
      }

      if (nextSlotId) {
        const dashboard = await sdk.slots.hostDashboard(nextSlotId);
        nextRoomId = dashboard.room.id;
        nextRoomName = dashboard.room.name;
      }

      if (!nextSlotId && nextRoomId) {
        const currentSlot = await sdk.rooms.currentSlot(nextRoomId);
        nextSlotId = currentSlot.id;
      }

      setRoomId(nextRoomId);
      setSlotId(nextSlotId);
      setRoomName(nextRoomName);

      const [cfg, sch, ov, users, logs] = await Promise.all([
        sdk.roomConfigs.get(nextRoomId),
        sdk.hostSchedules.list(nextRoomId),
        sdk.hostSchedules.listOverrides(nextRoomId),
        sdk.slots.userOptions(nextSlotId),
        sdk.notifications.logs({ limit: 100 }),
      ]);

      setConfigSnapshot(cfg);
      setMaxRank(String(cfg.configs.max_rank ?? 7));
      setOrderStartMinute(String(cfg.configs.order_start_minute ?? 0));
      setOrderStopMinute(String(cfg.configs.order_stop_minute ?? 10));
      setChallengeTtlSeconds(String(cfg.configs.challenge_ttl_seconds ?? 120));
      setEnableChallenge(Boolean(cfg.configs.enable_challenge ?? false));

      setSchedules(sch);
      setOverrides(ov);
      setUserOptions(users);
      setNotificationLogs(logs);
      setSchedulePage(1);
      setOverridePage(1);
      setNotificationPage(1);
      setAuditPage(1);

      if (nextSlotId) {
        const audits = await sdk.audit.bySlot(nextSlotId, 100);
        setAuditLogs(audits);
      }
    } catch (error) {
      showError(error);
    }
  };

  useDidShow(() => {
    requireLogin('/pages/ops/management/index').then((user) => {
      if (!user) return;
      loadAll();
    });
  });

  const handleSaveConfigs = async () => {
    if (!roomId) return;

    try {
      const confirmed = await confirmDanger('保存房间配置', '配置会立即生效，确认保存？');
      if (!confirmed) return;

      const saved = await sdk.roomConfigs.update(roomId, {
        configs: {
          max_rank: Number(maxRank),
          order_start_minute: Number(orderStartMinute),
          order_stop_minute: Number(orderStopMinute),
          enable_challenge: enableChallenge,
          challenge_ttl_seconds: Number(challengeTtlSeconds),
        },
      });
      setConfigSnapshot(saved);
      showSuccess('配置已保存');
    } catch (error) {
      showError(error);
    }
  };

  const handleCreateSchedule = async () => {
    if (!roomId || !scheduleHostUserId) return;

    try {
      await sdk.hostSchedules.create(roomId, {
        weekday: Number(scheduleWeekday),
        startHour: Number(scheduleStartHour),
        endHour: Number(scheduleEndHour),
        hostUserId: scheduleHostUserId,
        priority: Number(schedulePriority),
      });
      showSuccess('排班已新增');
      const list = await sdk.hostSchedules.list(roomId);
      setSchedules(list);
      setSchedulePage(1);
    } catch (error) {
      showError(error);
    }
  };

  const handleDeleteSchedule = async (id: string) => {
    try {
      const confirmed = await confirmDanger('删除排班', '删除后不可恢复，确认继续？');
      if (!confirmed) return;

      await sdk.hostSchedules.remove(id);
      showSuccess('排班已删除');
      if (roomId) {
        setSchedules(await sdk.hostSchedules.list(roomId));
      }
    } catch (error) {
      showError(error);
    }
  };

  const handleUpsertOverride = async () => {
    if (!roomId || !overrideHostUserId) return;

    try {
      await sdk.hostSchedules.upsertOverride(roomId, {
        slotDate: overrideDate,
        slotHour: Number(overrideHour),
        hostUserId: overrideHostUserId,
        oneTimeOnly: true,
        remark: overrideRemark,
      });
      showSuccess('override 已保存');
      setOverrides(await sdk.hostSchedules.listOverrides(roomId));
      setOverridePage(1);
    } catch (error) {
      showError(error);
    }
  };

  const handleDeleteOverride = async (id: string) => {
    try {
      const confirmed = await confirmDanger('删除 override', '删除后会回退到常规排班，确认继续？');
      if (!confirmed) return;

      await sdk.hostSchedules.removeOverride(id);
      showSuccess('override 已删除');
      if (roomId) {
        setOverrides(await sdk.hostSchedules.listOverrides(roomId));
      }
    } catch (error) {
      showError(error);
    }
  };

  const handleResolveHost = async () => {
    if (!roomId) return;

    try {
      const result = await sdk.hostSchedules.resolve(roomId, {
        slotDate: overrideDate,
        slotHour: Number(overrideHour),
      });

      const name = result.hostUser?.nickname || result.hostUserId || '无';
      setResolveResult(`${result.source} -> ${name}`);
      showSuccess('主持解析完成');
    } catch (error) {
      showError(error);
    }
  };

  const handleCheckTimeouts = async (dryRun = false) => {
    try {
      if (!dryRun) {
        const confirmed = await confirmDanger('执行超时提醒', '将真实更新状态并写入通知日志，确认继续？');
        if (!confirmed) return;
      }

      const result = await sdk.notifications.checkLeaveNoticeTimeouts({
        slotId: slotId || undefined,
        dryRun,
        simulateNowOffsetSeconds: 120,
      });
      setNotificationCheckResult(
        `checked=${result.checkedCount}, timeout=${result.timeoutCount}, logs=${result.logsCreated}, dryRun=${result.dryRun}`,
      );
      setNotificationLogs(await sdk.notifications.logs({ limit: 100 }));
      setNotificationPage(1);
      showSuccess('超时检查完成');
    } catch (error) {
      showError(error);
    }
  };

  const handleRefreshAudit = async () => {
    if (!slotId) return;
    try {
      setAuditLogs(await sdk.audit.bySlot(slotId, 100));
      setAuditPage(1);
      showSuccess('审计日志已刷新');
    } catch (error) {
      showError(error);
    }
  };

  return (
    <View className='container'>
      <View className='card'>
        <View className='title'>运营控制台</View>
        <Text className='subtitle'>房间：{roomName || roomId || '-'}</Text>
        <View className='subtitle mono'>roomId: {roomId || '-'}</View>
        <View className='subtitle mono'>slotId: {slotId || '-'}</View>
        <View className='btn-row' style={{ marginTop: '12px' }}>
          <Button onClick={loadAll}>刷新全部</Button>
        </View>
      </View>

      <View className='card'>
        <View className='tab-row'>
          {TAB_OPTIONS.map((tab) => (
            <Button
              key={tab.key}
              className={activeTab === tab.key ? 'tab-btn active' : 'tab-btn'}
              size='mini'
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </Button>
          ))}
        </View>
      </View>

      {activeTab === 'configs' ? (
        <View className='card'>
          <View className='title'>Room Configs</View>
          <View className='field-row'>
            <View className='field-label'>max_rank</View>
            <Input className='field-input' value={maxRank} onInput={(e) => setMaxRank(e.detail.value)} />
          </View>
          <View className='field-row'>
            <View className='field-label'>order_start_minute</View>
            <Input className='field-input' value={orderStartMinute} onInput={(e) => setOrderStartMinute(e.detail.value)} />
          </View>
          <View className='field-row'>
            <View className='field-label'>order_stop_minute</View>
            <Input className='field-input' value={orderStopMinute} onInput={(e) => setOrderStopMinute(e.detail.value)} />
          </View>
          <View className='field-row'>
            <View className='field-label'>challenge_ttl_seconds</View>
            <Input className='field-input' value={challengeTtlSeconds} onInput={(e) => setChallengeTtlSeconds(e.detail.value)} />
          </View>
          <View className='btn-row action-group'>
            <Button onClick={() => setEnableChallenge((v) => !v)}>{enableChallenge ? '关闭挑战' : '开启挑战'}</Button>
            <Button className='primary-btn' onClick={handleSaveConfigs}>保存配置</Button>
          </View>
          <View className='subtitle mono'>snapshot keys: {Object.keys(configSnapshot?.configs || {}).join(', ') || '-'}</View>
        </View>
      ) : null}

      {activeTab === 'schedules' ? (
        <View className='card'>
          <View className='title'>Host Schedules</View>
          <View className='field-row'>
            <View className='field-label'>搜索（主持/时段/优先级）</View>
            <Input
              className='field-input'
              value={scheduleKeyword}
              onInput={(e) => {
                setScheduleKeyword(e.detail.value);
                setSchedulePage(1);
              }}
              placeholder='输入关键词筛选排班'
            />
          </View>

          <View className='field-row'>
            <View className='field-label'>weekday / startHour / endHour / priority</View>
            <Input className='field-input' value={scheduleWeekday} onInput={(e) => setScheduleWeekday(e.detail.value)} />
            <Input className='field-input' value={scheduleStartHour} onInput={(e) => setScheduleStartHour(e.detail.value)} />
            <Input className='field-input' value={scheduleEndHour} onInput={(e) => setScheduleEndHour(e.detail.value)} />
            <Input className='field-input' value={schedulePriority} onInput={(e) => setSchedulePriority(e.detail.value)} />
          </View>
          <View className='btn-row action-group'>
            <Button
              onClick={async () => {
                try {
                  const selected = await pickUser('选择排班主持');
                  setScheduleHostUserId(selected.id);
                } catch (error) {
                  showError(error);
                }
              }}
            >
              选择主持
            </Button>
            <Button className='success-btn' onClick={handleCreateSchedule}>新增排班</Button>
          </View>
          <View className='subtitle'>选中主持：{userMap.get(scheduleHostUserId)?.nickname || scheduleHostUserId || '-'}</View>

          {schedulePaged.pageItems.map((item) => (
            <View className='list-item' key={item.id}>
              <View>#{item.id.slice(0, 8)} 周{item.weekday} {item.startHour}:00-{item.endHour}:00</View>
              <View className='subtitle'>主持：{item.hostUser?.nickname || item.hostUserId} / priority={item.priority}</View>
              <View className='btn-row action-group'>
                <Button className='danger-btn' onClick={() => handleDeleteSchedule(item.id)}>删除</Button>
              </View>
            </View>
          ))}
          <View className='pagination-row'>
            <Button disabled={schedulePaged.currentPage <= 1} onClick={() => setSchedulePage((p) => Math.max(1, p - 1))}>上一页</Button>
            <Text className='subtitle'>第 {schedulePaged.currentPage} / {schedulePaged.totalPages} 页</Text>
            <Button
              disabled={schedulePaged.currentPage >= schedulePaged.totalPages}
              onClick={() => setSchedulePage((p) => Math.min(schedulePaged.totalPages, p + 1))}
            >
              下一页
            </Button>
          </View>
        </View>
      ) : null}

      {activeTab === 'overrides' ? (
        <View className='card'>
          <View className='title'>Host Overrides & Resolve</View>
          <View className='field-row'>
            <View className='field-label'>搜索（主持/日期/小时/备注）</View>
            <Input
              className='field-input'
              value={overrideKeyword}
              onInput={(e) => {
                setOverrideKeyword(e.detail.value);
                setOverridePage(1);
              }}
              placeholder='输入关键词筛选 override'
            />
          </View>

          <View className='field-row'>
            <View className='field-label'>slotDate / slotHour / remark</View>
            <Input className='field-input' value={overrideDate} onInput={(e) => setOverrideDate(e.detail.value)} />
            <Input className='field-input' value={overrideHour} onInput={(e) => setOverrideHour(e.detail.value)} />
            <Input className='field-input' value={overrideRemark} onInput={(e) => setOverrideRemark(e.detail.value)} />
          </View>
          <View className='btn-row action-group'>
            <Button
              onClick={async () => {
                try {
                  const selected = await pickUser('选择 override 主持');
                  setOverrideHostUserId(selected.id);
                } catch (error) {
                  showError(error);
                }
              }}
            >
              选择 override 主持
            </Button>
            <Button className='success-btn' onClick={handleUpsertOverride}>保存 override</Button>
            <Button onClick={handleResolveHost}>解析主持</Button>
          </View>
          <View className='subtitle'>解析结果：{resolveResult || '-'}</View>

          {overridePaged.pageItems.map((item) => (
            <View className='list-item' key={item.id}>
              <View>#{item.id.slice(0, 8)} {String(item.slotDate).slice(0, 10)} {item.slotHour}:00</View>
              <View className='subtitle'>主持：{item.hostUser?.nickname || item.hostUserId}</View>
              <View className='btn-row action-group'>
                <Button className='danger-btn' onClick={() => handleDeleteOverride(item.id)}>删除</Button>
              </View>
            </View>
          ))}
          <View className='pagination-row'>
            <Button disabled={overridePaged.currentPage <= 1} onClick={() => setOverridePage((p) => Math.max(1, p - 1))}>上一页</Button>
            <Text className='subtitle'>第 {overridePaged.currentPage} / {overridePaged.totalPages} 页</Text>
            <Button
              disabled={overridePaged.currentPage >= overridePaged.totalPages}
              onClick={() => setOverridePage((p) => Math.min(overridePaged.totalPages, p + 1))}
            >
              下一页
            </Button>
          </View>
        </View>
      ) : null}

      {activeTab === 'notifications' ? (
        <View className='card'>
          <View className='title'>Notifications</View>
          <View className='field-row'>
            <View className='field-label'>搜索（模板/状态/渠道/用户）</View>
            <Input
              className='field-input'
              value={notificationKeyword}
              onInput={(e) => {
                setNotificationKeyword(e.detail.value);
                setNotificationPage(1);
              }}
              placeholder='输入关键词筛选通知日志'
            />
          </View>
          <View className='btn-row action-group'>
            <Button onClick={() => handleCheckTimeouts(true)}>超时检查（dry-run）</Button>
            <Button className='primary-btn' onClick={() => handleCheckTimeouts(false)}>执行超时提醒</Button>
          </View>
          <View className='subtitle mono'>{notificationCheckResult || '-'}</View>

          {notificationPaged.pageItems.map((item) => (
            <View className='list-item' key={item.id}>
              <View>{item.templateCode || '-'} / {item.status}</View>
              <View className='subtitle mono'>{item.createdAt}</View>
            </View>
          ))}
          <View className='pagination-row'>
            <Button disabled={notificationPaged.currentPage <= 1} onClick={() => setNotificationPage((p) => Math.max(1, p - 1))}>上一页</Button>
            <Text className='subtitle'>第 {notificationPaged.currentPage} / {notificationPaged.totalPages} 页</Text>
            <Button
              disabled={notificationPaged.currentPage >= notificationPaged.totalPages}
              onClick={() => setNotificationPage((p) => Math.min(notificationPaged.totalPages, p + 1))}
            >
              下一页
            </Button>
          </View>
        </View>
      ) : null}

      {activeTab === 'audit' ? (
        <View className='card'>
          <View className='title'>Audit (slot)</View>
          <View className='field-row'>
            <View className='field-label'>搜索（动作/操作人/目标）</View>
            <Input
              className='field-input'
              value={auditKeyword}
              onInput={(e) => {
                setAuditKeyword(e.detail.value);
                setAuditPage(1);
              }}
              placeholder='输入关键词筛选审计日志'
            />
          </View>
          <View className='btn-row action-group'>
            <Button onClick={handleRefreshAudit}>刷新审计</Button>
          </View>

          {auditPaged.pageItems.map((item) => (
            <View className='list-item' key={item.id}>
              <View>{item.action}</View>
              <View className='subtitle mono'>op={item.operatorUserId || '-'} / {item.createdAt}</View>
            </View>
          ))}
          <View className='pagination-row'>
            <Button disabled={auditPaged.currentPage <= 1} onClick={() => setAuditPage((p) => Math.max(1, p - 1))}>上一页</Button>
            <Text className='subtitle'>第 {auditPaged.currentPage} / {auditPaged.totalPages} 页</Text>
            <Button
              disabled={auditPaged.currentPage >= auditPaged.totalPages}
              onClick={() => setAuditPage((p) => Math.min(auditPaged.totalPages, p + 1))}
            >
              下一页
            </Button>
          </View>
        </View>
      ) : null}
    </View>
  );
}
