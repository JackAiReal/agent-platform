# 排麦系统架构、数据库、接口与后端模块方案

> 时间：2026-03-16  
> 目标：基于“微信小程序 + H5 + PC 共用一套前端代码”的多端排麦系统，给出完整的系统模块图、数据库结构、API 接口清单，以及 B 方案——后端项目目录结构与 NestJS 模块拆分方案。

---

# 一、项目目标

构建一套新的排麦系统，满足以下要求：

- 用户通过 **微信小程序** 进入是主路径
- 同一套前端代码同时支持：
  - 微信小程序
  - H5
  - PC Web
- 后端统一承载：
  - 房间
  - 档期
  - 排麦引擎
  - 主持控制
  - 报备
  - 权益
  - 统计报表
- 系统脱离“个人微信 Hook 作为核心执行层”的依赖
- 保留旧麦序机器人中的核心业务能力和玩法逻辑

推荐主技术栈：

- 前端：Taro + React + TypeScript
- 后端：NestJS + PostgreSQL + Redis + WebSocket + BullMQ
- 文件/导出：OSS / MinIO

---

# 二、系统模块图

## 2.1 总体架构图

```text
                         ┌───────────────────────────────┐
                         │         多端前端（Taro）        │
                         │  微信小程序 / H5 / PC Web      │
                         └──────────────┬────────────────┘
                                        │ HTTPS / WS
                         ┌──────────────▼────────────────┐
                         │        API Gateway / BFF       │
                         │  鉴权、聚合接口、角色裁剪、SDK   │
                         └──────────────┬────────────────┘
                                        │
        ┌───────────────────────────────┼────────────────────────────────┐
        │                               │                                │
┌───────▼────────┐             ┌────────▼────────┐              ┌────────▼────────┐
│  Auth 用户认证  │             │ Room 房间服务    │              │  Notice 通知服务 │
│ 微信登录/Token  │             │ 房间/角色/房间状态│              │ 订阅消息/站内消息 │
└───────┬────────┘             └────────┬────────┘              └────────┬────────┘
        │                               │                                │
        │                      ┌────────▼────────┐                       │
        │                      │ Slot 档期服务     │                       │
        │                      │ 每小时开档/截档   │                       │
        │                      └────────┬────────┘                       │
        │                               │                                │
        │                      ┌────────▼────────┐                       │
        │                      │ Rank 排麦引擎     │                       │
        │                      │ 排榜/去重/补排    │                       │
        │                      │ 买8/插队/置顶/转麦│                       │
        │                      └────────┬────────┘                       │
        │                               │                                │
        │                 ┌─────────────┼─────────────┐                  │
        │                 │             │             │                  │
        │        ┌────────▼───────┐ ┌───▼─────────┐ ┌─▼────────────┐     │
        │        │ Challenge 服务  │ │ Leave 报备  │ │ Host 主持排班 │     │
        │        │ 防刷/验证码/题库 │ │ 暂离/回厅提醒│ │ 排班/改单档   │     │
        │        └────────┬───────┘ └───┬─────────┘ └─┬────────────┘     │
        │                 │             │             │                  │
        │          ┌──────▼─────────────▼─────────────▼──────┐           │
        │          │         Metrics / Report 统计报表服务     │           │
        │          │ 打卡/黑麦/日报周报月报/导出/运营统计       │           │
        │          └───────────────────┬──────────────────────┘           │
        │                              │                                  │
        └──────────────────────────────┼──────────────────────────────────┘
                                       │
                   ┌───────────────────▼───────────────────┐
                   │              数据层                    │
                   │ PostgreSQL + Redis + OSS/对象存储      │
                   └───────────────────────────────────────┘
```

## 2.2 前端模块图

```text
前端（Taro Monorepo）
│
├─ 公共层
│  ├─ api-client         # 统一接口调用
│  ├─ auth               # 登录态、权限
│  ├─ store              # 状态管理
│  ├─ hooks              # 共享 hooks
│  ├─ utils              # 工具函数
│  └─ ui                 # 公共组件
│
├─ 用户端
│  ├─ 房间列表页
│  ├─ 房间详情页
│  ├─ 排麦页
│  ├─ 我的排位页
│  ├─ 报备页
│  ├─ 我的记录页
│  └─ 我的权益页
│
├─ 主持端
│  ├─ 主持控制台
│  ├─ 当前榜单页
│  ├─ 手动操作页
│  ├─ 报备管理页
│  ├─ 规则控制页
│  └─ 主持排班页
│
└─ 管理端
   ├─ 房间管理
   ├─ 用户管理
   ├─ 规则配置
   ├─ 权益配置
   ├─ 报表中心
   └─ 系统设置
```

## 2.3 核心状态机

### 档期状态机

```text
pending
  ↓
opening
  ↓
open
  ├─ 到手速截止 → speed_closed
  ├─ 榜满提前截止 → speed_closed
  ↓
final_open
  ↓
final_closed
  ↓
settled
```

### 排麦条目状态机

```text
draft
  ↓
challenged
  ↓
active
  ├─ 用户取消 → cancelled
  ├─ 被顶掉 → replaced
  ├─ 主持作废 → invalid
  ├─ 转给他人 → transferred
  └─ 档期结束 → settled
```

---

# 三、数据库结构设计

推荐数据库：PostgreSQL  
推荐缓存/实时层：Redis

## 3.1 用户与权限域

### users
- id
- openid
- unionid
- nickname
- avatar_url
- phone
- status
- created_at
- updated_at

### roles
- id
- code
- name
- created_at

角色值建议：
- user
- host
- room_admin
- super_admin
- operator

### user_room_roles
- id
- user_id
- room_id
- role_code
- created_at

---

## 3.2 房间与配置域

### rooms
- id
- name
- code
- status
- description
- entry_cover_url
- is_active
- created_at
- updated_at

### room_configs
- id
- room_id
- config_key
- config_value(jsonb)
- updated_by
- updated_at

配置 key 示例：
- max_rank
- order_start_minute
- order_stop_minute
- order_add_minute
- order_add_min_value
- allow_cancel
- cancel_stop_minute
- allow_insert
- insert_stop_minute
- allow_buy8
- buy8_stop_minute
- enable_top_card
- top_card_limit
- enable_leave_notice
- leave_limit_num
- leave_limit_per_user
- enable_challenge
- challenge_mode
- enable_lianpai

### room_announcements
- id
- room_id
- content
- is_active
- created_by
- created_at

---

## 3.3 主持排班域

### room_host_schedules
- id
- room_id
- weekday
- start_hour
- end_hour
- host_user_id
- priority
- is_active
- created_at
- updated_at

### room_host_overrides
- id
- room_id
- slot_date
- slot_hour
- host_user_id
- one_time_only
- remark
- created_by
- created_at

---

## 3.4 档期与榜单域

### room_slots
- id
- room_id
- slot_date
- slot_hour
- start_at
- speed_close_at
- final_close_at
- state
- host_user_id
- challenge_id
- is_full
- settled_at
- created_at
- updated_at

状态：
- pending
- opening
- open
- speed_closed
- final_open
- final_closed
- settled
- cancelled

### rank_entries
- id
- room_slot_id
- user_id
- source_type
- source_content
- score
- status
- is_top
- is_buy8
- is_insert
- origin_entry_id
- metadata(jsonb)
- created_at
- updated_at

状态：
- active
- cancelled
- invalid
- replaced
- transferred
- settled

source_type：
- keyword
- manual
- fixed
- top_card
- buy8
- insert
- transfer
- challenge_pass

### rank_snapshots
- id
- room_slot_id
- snapshot_type
- snapshot_data(jsonb)
- created_at

快照类型：
- opening_rank
- speed_rank
- final_rank
- settled_rank

### rank_action_logs
- id
- room_slot_id
- operator_user_id
- target_user_id
- action
- payload(jsonb)
- created_at

动作示例：
- join
- cancel
- invalidate
- transfer
- buy8_replace
- top_replace
- manual_add
- manual_remove
- host_skip
- host_adjust

---

## 3.5 规则与 challenge 域

### room_rule_sets
- id
- room_id
- name
- version
- is_active
- created_by
- created_at

### room_rule_items
- id
- rule_set_id
- keyword
- normalized_keyword
- score
- rule_type
- is_enabled
- extra(jsonb)
- created_at
- updated_at

rule_type：
- speed
- task
- top
- buy8
- insert
- special

### challenge_instances
- id
- room_slot_id
- challenge_type
- prompt_text
- prompt_asset_url
- answer_hash
- answer_payload(jsonb)
- expires_at
- status
- created_at

challenge_type：
- math
- image_captcha
- fake_code
- two_num
- two_hanzi
- qa

### challenge_submissions
- id
- challenge_instance_id
- user_id
- submit_content
- is_passed
- created_at

---

## 3.6 报备域

### leave_notices
- id
- room_slot_id
- user_id
- status
- start_at
- return_deadline
- returned_at
- remind_count
- metadata(jsonb)
- created_at
- updated_at

状态：
- active
- returned
- expired
- cancelled

---

## 3.7 权益域

### user_perk_inventories
- id
- user_id
- room_id
- perk_type
- quantity
- expire_at
- created_at
- updated_at

perk_type：
- top_card
- priority_join
- special_slot
- buy8_ticket

### perk_usage_logs
- id
- user_id
- room_id
- room_slot_id
- perk_type
- used_quantity
- target_entry_id
- payload(jsonb)
- created_at

---

## 3.8 统计与打卡域

### metric_events
- id
- room_id
- room_slot_id
- metric_key
- actor_user_id
- target_user_id
- delta
- host_user_id
- source_type
- remark
- created_at

metric_key 示例：
- black_record
- check_in
- task_plus
- task_minus

### daily_room_stats
- id
- room_id
- stat_date
- total_join_count
- total_active_users
- total_leave_count
- total_black_records
- payload(jsonb)
- created_at
- updated_at

### daily_user_stats
- id
- room_id
- user_id
- stat_date
- join_count
- top_count
- buy8_count
- leave_count
- payload(jsonb)
- created_at

---

## 3.9 风控与封禁域

### room_ban_policies
- id
- room_id
- user_id
- ban_type
- reason
- start_at
- end_at
- created_by
- created_at

ban_type：
- queue_ban
- temp_ban
- cooldown
- mute_action

---

## 3.10 审计与系统域

### operator_logs
- id
- room_id
- room_slot_id
- operator_user_id
- action
- target_type
- target_id
- payload(jsonb)
- created_at

### notification_logs
- id
- user_id
- channel
- template_code
- payload(jsonb)
- status
- error_message
- created_at

---

## 3.11 Redis 结构设计

### 当前房间档期
- `room:{roomId}:current_slot` -> slotId

### 档期状态
- `slot:{slotId}:state`

### 实时榜单
- `slot:{slotId}:rank:zset`

### 榜单详情
- `slot:{slotId}:rank:entries`

### 当前 challenge
- `slot:{slotId}:challenge`

### 报备状态
- `slot:{slotId}:leave:{userId}`

### 房间在线用户
- `room:{roomId}:online_users`

### 分布式锁
- `lock:slot:{slotId}:rank`
- `lock:slot:{slotId}:settle`

---

# 四、API 接口清单

统一前缀：`/api/v1`

## 4.1 Auth

### 微信小程序登录
`POST /auth/wechat-mini/login`

### H5/PC 登录
`POST /auth/login`

### 刷新 token
`POST /auth/refresh`

### 当前用户信息
`GET /auth/me`

---

## 4.2 房间接口

### 房间列表
`GET /rooms`

### 房间详情
`GET /rooms/{roomId}`

### 房间当前状态
`GET /rooms/{roomId}/status`

### 最新公告
`GET /rooms/{roomId}/announcements/latest`

---

## 4.3 档期接口

### 当前档详情
`GET /rooms/{roomId}/current-slot`

### 指定档详情
`GET /slots/{slotId}`

### 指定档榜单
`GET /slots/{slotId}/rank`

### 历史档列表
`GET /rooms/{roomId}/slots`

---

## 4.4 用户排麦接口

### 获取当前 challenge
`GET /slots/{slotId}/challenge`

### 提交 challenge
`POST /slots/{slotId}/challenge/submit`

### 报名排麦
`POST /slots/{slotId}/rank/join`

### 取消排麦
`POST /slots/{slotId}/rank/cancel`

### 查询我的排位
`GET /slots/{slotId}/rank/me`

### 转麦
`POST /slots/{slotId}/rank/transfer`

### 买8
`POST /slots/{slotId}/rank/buy8`

### 插队
`POST /slots/{slotId}/rank/insert`

### 使用置顶卡
`POST /slots/{slotId}/rank/use-top-card`

---

## 4.5 报备接口

### 发起报备
`POST /slots/{slotId}/leave-notices`

### 回厅
`POST /leave-notices/{leaveNoticeId}/return`

### 我的报备状态
`GET /slots/{slotId}/leave-notices/me`

---

## 4.6 主持端接口

### 主持控制台数据
`GET /slots/{slotId}/host-dashboard`

### 手动加人
`POST /slots/{slotId}/host/manual-add`

### 手动作废
`POST /slots/{slotId}/host/invalidate-entry`

### 手动转麦
`POST /slots/{slotId}/host/transfer-entry`

### 跳过用户
`POST /slots/{slotId}/host/skip-user`

### 重置本档
`POST /slots/{slotId}/host/reset-slot`

### 开关补排
`POST /slots/{slotId}/host/toggle-add-stage`

### 提前截档
`POST /slots/{slotId}/host/close-speed-stage`

### 关闭最终报名
`POST /slots/{slotId}/host/close-final-stage`

---

## 4.7 主持排班接口

### 获取排班表
`GET /rooms/{roomId}/host-schedules`

### 新增排班
`POST /rooms/{roomId}/host-schedules`

### 修改排班
`PUT /host-schedules/{scheduleId}`

### 删除排班
`DELETE /host-schedules/{scheduleId}`

### 临时改单档主持
`POST /rooms/{roomId}/host-overrides`

---

## 4.8 规则接口

### 获取启用规则集
`GET /rooms/{roomId}/rule-sets/active`

### 创建规则集
`POST /rooms/{roomId}/rule-sets`

### 启用规则集
`POST /rooms/{roomId}/rule-sets/{ruleSetId}/activate`

### 规则项列表
`GET /rule-sets/{ruleSetId}/items`

### 新增规则项
`POST /rule-sets/{ruleSetId}/items`

### 修改规则项
`PUT /rule-items/{ruleItemId}`

### 删除规则项
`DELETE /rule-items/{ruleItemId}`

### 修改房间配置
`PUT /rooms/{roomId}/configs`

---

## 4.9 权益接口

### 我的权益列表
`GET /me/perks`

### 房间内我的权益
`GET /rooms/{roomId}/me/perks`

### 发放权益
`POST /admin/perks/grant`

### 权益使用记录
`GET /me/perk-usage-logs`

---

## 4.10 统计与报表接口

### 我的排麦记录
`GET /me/rank-history`

### 房间日报
`GET /rooms/{roomId}/reports/daily`

### 房间周报
`GET /rooms/{roomId}/reports/weekly`

### 房间月报
`GET /rooms/{roomId}/reports/monthly`

### 区间统计
`GET /rooms/{roomId}/reports/range`

### 导出 Excel
`POST /rooms/{roomId}/reports/export`

---

## 4.11 黑名单/禁排接口

### 禁排列表
`GET /rooms/{roomId}/ban-policies`

### 添加禁排
`POST /rooms/{roomId}/ban-policies`

### 解除禁排
`DELETE /ban-policies/{banPolicyId}`

---

## 4.12 管理端接口

### 房间管理列表
`GET /admin/rooms`

### 创建房间
`POST /admin/rooms`

### 修改房间
`PUT /admin/rooms/{roomId}`

### 系统总览
`GET /admin/dashboard`

### 操作日志
`GET /admin/operator-logs`

---

## 4.13 WebSocket 事件

客户端订阅：
- `room:subscribe`
- `slot:subscribe`

服务端事件：
- `rank.updated`
- `rank.me.changed`
- `slot.state.changed`
- `challenge.updated`
- `leave.notice.updated`
- `host.action.broadcast`
- `notification.created`

---

# 五、方案 B：后端项目目录结构 + NestJS 模块拆分方案

这一部分是当前文档的重点。

目标：

- 后端采用 **模块化单体**，不要一上来拆微服务
- 业务边界清晰
- 可快速落地 MVP
- 后续可平滑拆分服务

---

## 5.1 推荐目录结构

```text
apps/
  server/
    src/
      main.ts
      app.module.ts

      common/
        constants/
        decorators/
        dto/
        enums/
        exceptions/
        filters/
        guards/
        interceptors/
        pipes/
        utils/

      config/
        app.config.ts
        db.config.ts
        redis.config.ts
        jwt.config.ts
        ws.config.ts

      infrastructure/
        prisma/
          prisma.module.ts
          prisma.service.ts
        redis/
          redis.module.ts
          redis.service.ts
        queue/
          queue.module.ts
          queue.service.ts
        storage/
          storage.module.ts
          storage.service.ts
        ws/
          ws.module.ts
          ws.gateway.ts
        logger/
          logger.module.ts
          logger.service.ts

      modules/
        auth/
          auth.module.ts
          controllers/
          services/
          dto/
          strategies/
          guards/

        users/
          users.module.ts
          controllers/
          services/
          repositories/
          dto/
          entities/

        rooms/
          rooms.module.ts
          controllers/
          services/
          repositories/
          dto/
          entities/

        room-configs/
          room-configs.module.ts
          controllers/
          services/
          repositories/
          dto/

        host-schedules/
          host-schedules.module.ts
          controllers/
          services/
          repositories/
          dto/

        slots/
          slots.module.ts
          controllers/
          services/
          repositories/
          dto/
          jobs/

        rank/
          rank.module.ts
          controllers/
          services/
            rank-query.service.ts
            rank-command.service.ts
            rank-policy.service.ts
            rank-settle.service.ts
          repositories/
          dto/
          policies/
            buy8.policy.ts
            top-card.policy.ts
            insert.policy.ts
            cancel.policy.ts
            transfer.policy.ts

        challenges/
          challenges.module.ts
          controllers/
          services/
          repositories/
          providers/
            math.provider.ts
            fake-code.provider.ts
            image-captcha.provider.ts
            qa.provider.ts
          dto/

        leave-notices/
          leave-notices.module.ts
          controllers/
          services/
          repositories/
          jobs/
          dto/

        perks/
          perks.module.ts
          controllers/
          services/
          repositories/
          dto/

        metrics/
          metrics.module.ts
          controllers/
          services/
          repositories/
          dto/

        reports/
          reports.module.ts
          controllers/
          services/
            report-query.service.ts
            report-export.service.ts
          repositories/
          dto/

        moderation/
          moderation.module.ts
          controllers/
          services/
          repositories/
          dto/

        notifications/
          notifications.module.ts
          controllers/
          services/
            notification.service.ts
            miniapp-subscribe.service.ts
            inbox.service.ts
            wecom.service.ts
          repositories/
          dto/

        audit/
          audit.module.ts
          controllers/
          services/
          repositories/

      jobs/
        cron/
          open-slot.job.ts
          close-slot.job.ts
          settle-slot.job.ts
          daily-report.job.ts
        processors/
          notification.processor.ts
          leave-notice.processor.ts
          report.processor.ts

      scripts/
        seed.ts
        migrate.ts
```

---

## 5.2 模块职责拆分

## AuthModule

职责：
- 微信小程序登录
- H5/PC 登录
- JWT / Refresh Token
- 当前用户身份识别
- 角色权限守卫

不要承载业务逻辑，只做认证授权。

---

## UsersModule

职责：
- 用户资料
- 用户基础查询
- 用户与房间关系
- 用户画像扩展

对外提供：
- 查用户信息
- 查某房间用户角色
- 查当前主持/房管用户详情

---

## RoomsModule

职责：
- 房间信息
- 房间列表
- 房间上下线
- 房间入口信息
- 房间状态聚合

注意：
房间配置不要全塞在这个模块里，配置单独拆出去。

---

## RoomConfigsModule

职责：
- 房间配置读写
- 房间开关项
- 房间玩法参数
- 房间规则引用关系

建议：
- 配置变更要记录审计日志
- 配置变更后要同步刷新 Redis 缓存

---

## HostSchedulesModule

职责：
- 主持排班管理
- 当前档主持解析
- 临时改单档主持
- 通宵档、特殊档排班扩展

输出能力：
- 根据 roomId + slotDate + slotHour 解析当前主持

这个模块不要依赖前端格式字符串，统一结构化输入输出。

---

## SlotsModule

职责：
- 创建每小时档期
- 开档
- 截止手速阶段
- 截止最终阶段
- 结算档期
- 管理 slot 状态机

这是系统主链路模块之一。

建议拆成：
- SlotCommandService：创建/开档/截档/结算
- SlotQueryService：查当前档、历史档、当前状态
- SlotSchedulerService：和 BullMQ/Cron 交互

---

## RankModule

职责：
- 报名排麦
- 排序去重
- 顶榜
- 买8
- 插队
- 转麦
- 作废
- 取排
- 手动加榜
- 榜单快照

这是系统最核心模块。

建议进一步拆：

### RankQueryService
- 查当前榜
- 查我的排位
- 查历史榜快照

### RankCommandService
- join
- cancel
- transfer
- manualAdd
- invalidate

### RankPolicyService
- 聚合调用各种 policy

### RankSettleService
- 生成手速榜/最终榜快照
- 结算当前档榜单

### policies/
- buy8.policy.ts
- top-card.policy.ts
- insert.policy.ts
- cancel.policy.ts
- transfer.policy.ts

这样比把所有 if/else 塞在一个 service 里健康得多。

---

## ChallengesModule

职责：
- 生成 challenge
- 校验 challenge
- 维护 challenge 生命周期
- 支持不同 challenge provider

建议 provider 化：
- MathProvider
- FakeCodeProvider
- ImageCaptchaProvider
- QaProvider

优点：
以后新增 challenge，不会污染主业务链。

---

## LeaveNoticesModule

职责：
- 发起暂离报备
- 回厅确认
- 报备超时提醒
- 报备限制（人数/每人次数）

建议拆：
- LeaveNoticeService：主逻辑
- LeaveNoticeReminderJob：调度提醒
- LeaveNoticeQueryService：查询当前报备状态

---

## PerksModule

职责：
- 置顶卡库存
- 买位权益
- 权益使用
- 权益过期
- 权益发放

这块要和 RankModule 解耦：
- RankModule 只判断“当前用户是否可使用某玩法”
- PerksModule 真正负责权益扣减和审计

---

## MetricsModule

职责：
- 黑麦记录
- 打卡记录
- 用户行为统计事件
- 汇总统计原始数据

注意：
这里应该存“原子事件”，不要一上来就只存日报结果。

---

## ReportsModule

职责：
- 日报/周报/月报
- 区间统计
- 导出 Excel / CSV
- 聚合房间数据
- 聚合用户数据

建议拆：
- ReportQueryService：查报表
- ReportExportService：导出文件

---

## ModerationModule

职责：
- 禁排
- 临时封禁
- 冷却时间
- 风控策略

不要把黑名单逻辑写进 RankModule；RankModule 只调用这个模块判断“是否允许报名”。

---

## NotificationsModule

职责：
- 小程序订阅消息
- 站内通知
- 企业微信通知
- 通知日志

建议拆：
- NotificationService：统一入口
- MiniappSubscribeService
- InboxService
- WecomService

这样以后你换推送渠道不会牵一发而动全身。

---

## AuditModule

职责：
- 后台操作日志
- 关键业务动作日志
- 风险动作留痕

任何：
- 改榜
- 改主持
- 改配置
- 发放权益
- 禁排
都应该写审计。

---

# 六、模块之间的调用关系

推荐依赖方向：

```text
Auth → Users
Rooms → RoomConfigs / HostSchedules / Slots
Slots → HostSchedules / Challenges / Rank / Notifications
Rank → RoomConfigs / Moderation / Perks / Audit / Notifications
LeaveNotices → RoomConfigs / Notifications / Audit
Reports → Metrics / Rank / Rooms
Moderation → Users / Rooms
Notifications → 基础设施，不反向依赖业务模块
Audit → 基础日志，不反向依赖业务模块
```

原则：

- **业务模块依赖基础能力模块**
- **不要让 Notifications、Audit 反向依赖具体业务流程**
- **避免循环依赖**

---

# 七、推荐的服务边界写法

在 NestJS 里，每个模块建议分四层：

## 7.1 Controller
负责：
- 接口入参
- DTO 校验
- 调 service
- 返回 VO

## 7.2 Service
负责：
- 核心业务逻辑
- 调用 repository 和其他模块能力

## 7.3 Repository
负责：
- DB 读写
- 封装 Prisma/ORM 查询

## 7.4 Policy / Provider
负责：
- 业务规则决策
- 可替换算法
- 可插拔能力

这会让代码结构明显比“controller 直接堆业务”好维护。

---

# 八、MVP 阶段建议先做哪些模块

第一期不要全上，建议只做这些：

## P1 必做
- AuthModule
- UsersModule
- RoomsModule
- RoomConfigsModule
- HostSchedulesModule
- SlotsModule
- RankModule
- ChallengesModule（先实现 1~2 种 challenge）
- NotificationsModule（先做 WebSocket + 小程序订阅消息）
- AuditModule

## P2 再做
- LeaveNoticesModule
- MetricsModule
- ReportsModule
- ModerationModule

## P3 再做
- PerksModule
- 更复杂的玩法 policy
- 企业微信通知
- 运营总后台增强

---

# 九、后端开发顺序建议

## 第 1 步：先打基础设施
- Prisma
- Redis
- JWT
- WebSocket
- BullMQ
- 日志

## 第 2 步：先跑主链路
- 登录
- 房间
- 当前档
- 报名排麦
- 查榜单
- 主持端手动操作
- 实时榜更新

## 第 3 步：补档期生命周期
- 自动开档
- 自动截档
- 自动结算
- 榜单快照

## 第 4 步：补运营功能
- 报备
- 统计
- 黑名单
- 导出

## 第 5 步：补权益和复杂玩法
- 置顶卡
- 买8
- 插队
- 连排

---

# 十、后端编码规范建议

为了避免未来变成第二个“5000 行巨石”，建议一开始就立规矩：

## 10.1 一条规则
**业务逻辑不准写进 controller。**

## 10.2 一类规则一份 policy
比如：
- buy8.policy.ts
- top-card.policy.ts
- cancel.policy.ts
- insert.policy.ts

## 10.3 状态变更必须走 service
不要 repository 里偷偷改状态。

## 10.4 关键动作必须写 audit
包括：
- 手动改榜
- 修改房间规则
- 发放权益
- 封禁用户

## 10.5 所有状态都要可重放
最好做到：
- 排麦主链路可从 action log + rank entries 重建

---

# 十一、最终建议

如果你要正式让团队开工，这份后端模块方案可以直接作为：

- 技术设计初稿
- 后端目录结构模板
- 模块拆分依据
- 评估工期时的边界说明

最关键的判断是：

> 先做“模块化单体”，不要一开始搞微服务。

因为你现在最重要的是：
- 把业务规则理顺
- 把核心状态机跑稳
- 把实时榜单和主持控制台做顺

等业务稳定后，再考虑把：
- Reports
- Notifications
- Challenge
- Metrics
拆出来单独服务。

---

# 十二、下一步建议

下一步最值得继续补的是二选一：

1. **前端页面结构图 + 页面路由设计**
2. **后端项目初始化骨架（NestJS module tree + DTO/Service/Repository 模板）**

如果目标是马上开工，我建议优先做第 2 个。
