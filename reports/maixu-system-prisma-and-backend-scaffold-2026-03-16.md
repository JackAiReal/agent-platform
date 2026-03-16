# 排麦系统 Prisma 第一版与后端骨架开工记录

> 时间：2026-03-16  
> 目标：在既有“微信小程序 + H5 + PC 一套代码多端”的方案基础上，继续补齐 Prisma schema 第一版，并正式进入方案 B：NestJS + Prisma 后端骨架搭建。

---

# 一、本次新增内容

本次在原有方案基础上，继续往前推进两部分：

1. **Prisma schema 第一版**
2. **后端骨架正式开工（方案 B）**

定位：

- 先做一个**模块化单体**后端
- 让核心主链路先跑通
- 后续再逐步补玩法、报表和运营模块

---

# 二、Prisma 第一版设计原则

## 2.1 主键统一使用 UUID

采用 UUID 而不是 bigint，原因：

- 避免 Node / Prisma / JSON 序列化中的 bigint 麻烦
- 更适合后续拆服务和异步任务
- 更适合对外暴露 ID

## 2.2 先保主链路，不追求一步到位

第一版 schema 的目标不是“囊括未来所有表”，而是让这些核心域可落地：

- 用户与角色
- 房间与配置
- 主持排班
- 档期
- 榜单
- 规则引擎
- challenge
- 报备
- 权益
- 统计事件
- 禁排
- 审计
- 通知日志

## 2.3 配置先用 key-value + json

`room_configs` 先用：

- `config_key`
- `config_value(json)`

这样业务变化时扩展快，等规则稳定后，再把高频配置结构化。

---

# 三、Prisma 第一版核心表

已纳入第一版 schema 的主要模型：

## 3.1 用户与权限
- `User`
- `UserRoomRole`

## 3.2 房间与配置
- `Room`
- `RoomConfig`

## 3.3 主持排班
- `RoomHostSchedule`
- `RoomHostOverride`

## 3.4 档期与榜单
- `RoomSlot`
- `RankEntry`
- `RankSnapshot`
- `RankActionLog`

## 3.5 规则与 challenge
- `RoomRuleSet`
- `RoomRuleItem`
- `ChallengeInstance`
- `ChallengeSubmission`

## 3.6 报备
- `LeaveNotice`

## 3.7 权益
- `UserPerkInventory`
- `PerkUsageLog`

## 3.8 统计与审计
- `MetricEvent`
- `RoomBanPolicy`
- `OperatorLog`
- `NotificationLog`

---

# 四、推荐 migration 顺序

为了减少首期出错成本，建议按 4 批 migration 推进：

## migration 01：基础身份与房间
- users
- rooms
- user_room_roles
- room_configs
- room_host_schedules
- room_host_overrides

## migration 02：档期与排麦
- room_slots
- rank_entries
- rank_snapshots
- rank_action_logs

## migration 03：规则、challenge、报备
- room_rule_sets
- room_rule_items
- challenge_instances
- challenge_submissions
- leave_notices

## migration 04：权益、统计、审计
- user_perk_inventories
- perk_usage_logs
- metric_events
- room_ban_policies
- operator_logs
- notification_logs

---

# 五、方案 B：后端骨架正式开工

本次进入方案 B，即直接开始搭后端代码骨架。

## 5.1 技术栈

- NestJS
- Prisma
- PostgreSQL
- Redis
- WebSocket
- BullMQ（先预留模块位）

## 5.2 后端目录目标

建议按下面结构推进：

```text
maixu-system/
  apps/
    server/
      src/
        common/
        config/
        infrastructure/
        modules/
        jobs/
      prisma/
        schema.prisma
```

## 5.3 第一批模块

首批先搭这些模块骨架：

- auth
- users
- rooms
- room-configs
- host-schedules
- slots
- rank
- challenges
- leave-notices
- notifications
- audit

基础设施：

- prisma
- redis
- ws
- logger

---

# 六、各模块职责摘要

## AuthModule
- 微信登录 / Token / 权限守卫

## UsersModule
- 用户资料、角色查询

## RoomsModule
- 房间信息、房间状态摘要

## RoomConfigsModule
- 房间配置与玩法开关

## HostSchedulesModule
- 主持排班、改单档主持

## SlotsModule
- 每小时开档 / 截档 / 结算

## RankModule
- 报名排麦 / 去重排序 / 取排 / 作废 / 转麦 / 买8 / 插队 / 榜单快照

## ChallengesModule
- challenge 生成与校验

## LeaveNoticesModule
- 报备与回厅提醒

## NotificationsModule
- 小程序订阅消息 / 站内消息 / WebSocket 推送

## AuditModule
- 所有关键动作审计

---

# 七、后端骨架阶段的开发目标

本次开工的目标不是一次性写完全部业务，而是：

1. 初始化工程结构
2. 建立模块边界
3. 接入 Prisma schema
4. 预留 Redis / WebSocket / Queue 基础设施
5. 为后续真正实现主链路打基础

换句话说，这一版更偏：

> **可持续开发的工程底座**

而不是“把所有业务糊在一个 service 里”。

---

# 八、建议的下一步实现顺序

## 第一步
先完成：
- AppModule
- PrismaModule
- RedisModule
- WsModule
- 核心业务模块空骨架

## 第二步
实现最短主链路：
- 登录
- 房间列表
- 当前档
- 报名排麦
- 查榜单
- 主持端手动操作

## 第三步
补自动档期：
- 开档
- 截档
- 结算

## 第四步
补周边：
- challenge
- 报备
- 通知
- 审计

---

# 九、结论

本次方案已经从“讨论设计”进入“正式开工”的阶段。

当前推荐路线是：

- 用 Prisma schema 第一版建立数据基础
- 用 NestJS 模块化单体搭建后端骨架
- 先打通房间、档期、排麦三条主链路
- 后续再逐步补主持、报备、玩法、统计和报表

这条路线的优点是：

- 工程结构不会一开始失控
- 业务规则有地方安放
- 后面加玩法不会继续长成巨石脚本

---

# 十、备注

本次文档对应的实际动作包括：

- 继续沉淀一份 Prisma 与后端骨架的设计文档
- 随后开始在工作区搭建 NestJS + Prisma 的初始目录与代码骨架

如果继续推进，下一步最直接的成果应当是：

1. 可运行的 NestJS 项目骨架
2. `schema.prisma` 初版文件
3. 各业务模块的 module/controller/service 占位实现
