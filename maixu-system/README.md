# Maixu System

排麦系统工程骨架（NestJS + Prisma + Taro + Frontend SDK）。

## 当前内容

- NestJS 后端骨架与主链路接口（Auth / Rooms / Slots / Rank）
- 主持端控制接口（dashboard / 作废 / 转麦 / 重置 / 截手速 / 补排开关）
- Challenge 验证链路（发题 / 验证 / ticket 后置加榜）
- Leave Notice 报备闭环（用户报备/回厅、主持查看、WebSocket 状态同步）
- Notifications（报备超时检查 + 通知日志 + Cron 自动巡检 + 待发送重试）
- Audit（主持关键操作日志）
- Room Configs + Host Schedules（配置可运营化）
- Users 治理（搜索/状态管理/黑白名单/封禁策略）
- 排麦规则引擎（Top Card / Buy8 / Insert / Settle）
- Auth 增强（微信 code 登录入口 + refresh token）
- Prisma schema + 初始 migration + seed
- Taro 前端页面骨架（登录 / 房间列表 / 房间详情 / 主持台 / 运营控制台）
- TypeScript Frontend SDK（fetch + taro transport）
- WebSocket 实时刷新（房间详情页、主持台收到 `rank.updated` 与 `leave-notice.updated` 即时更新）

---

## A 路线：切到真实 PostgreSQL 联调

### 1) 启动本地 PostgreSQL + Redis（Docker）

```bash
cd maixu-system
npm run db:up
```

> 默认端口：PostgreSQL `5432`，Redis `6379`
>
> 如果你本机拉取 Docker Hub 很慢，可以切镜像源再启动：
>
> ```bash
> MAIXU_POSTGRES_IMAGE=registry.cn-hangzhou.aliyuncs.com/library/postgres:16-alpine \
> MAIXU_REDIS_IMAGE=registry.cn-hangzhou.aliyuncs.com/library/redis:7-alpine \
> npm run db:up
> ```

### 2) 配置后端环境变量

```bash
cp apps/server/.env.example apps/server/.env
```

`.env.example` 默认值已对应 docker-compose 服务：

- `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/maixu?schema=public`
- `REDIS_URL=redis://127.0.0.1:6379`
- `JWT_REFRESH_SECRET` / `JWT_REFRESH_EXPIRES_IN`
- `WECHAT_MINI_APP_ID` / `WECHAT_MINI_APP_SECRET`（可选，真实微信登录）
- `WECOM_WEBHOOK_URL`（可选，企业微信通知投递）
- `NOTIFICATION_TIMEOUT_CRON_ENABLED` / `NOTIFICATION_TIMEOUT_EVERY_MINUTES`

### 3) 初始化数据库

```bash
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
```

### 4) 启动后端

```bash
npm run dev:server
```

### 5) 跑一轮数据库联调 smoke test

另开一个终端执行：

```bash
npm run smoke:db
```

通过后会输出：

```text
✅ Smoke test passed: PostgreSQL mode main flow is healthy
```

### 6) 跑 challenge 主链路 smoke test

```bash
npm run smoke:challenge
```

通过后会输出：

```text
✅ Challenge smoke passed
```

### 7) 跑 WebSocket 实时刷新 smoke test

```bash
npm run smoke:ws
```

通过后会输出：

```text
✅ WS smoke passed
```

### 8) 跑 Leave Notice 报备闭环 smoke test

```bash
npm run smoke:leave
```

通过后会输出：

```text
✅ Leave notice smoke passed
```

### 9) 跑运营模块（Notifications/Audit/Configs/Schedules）smoke test

```bash
npm run smoke:ops
```

通过后会输出：

```text
✅ Ops smoke passed
```

---

## 前端快速联调

可选先配置前端环境变量：

```bash
cp apps/client/.env.example apps/client/.env
```

然后启动：

```bash
npm run dev:client:h5
# 或
npm run dev:client:weapp
```

登录页提供了 3 个种子账号快捷登录（需要先执行 seed）：

- 演示主持（`seed-host-openid`）
- 演示用户（`seed-guest-openid`）
- 系统管理员（`seed-admin-openid`）

也可以输入任意昵称作为普通用户登录。

---

## 常用脚本

- `npm run db:up`：启动 PostgreSQL + Redis
- `npm run db:down`：停止并移除容器
- `npm run db:logs`：查看数据库日志
- `npm run backup:db`：创建 PostgreSQL 备份（含保留清理）
- `npm run restore:db -- <dumpFile>`：从备份恢复数据库
- `npm run dev:server`：启动后端
- `npm run build:server`：构建后端
- `npm run prisma:generate` / `npm run prisma:migrate` / `npm run prisma:seed`
- `npm run dev:client:h5` / `npm run dev:client:weapp`
- `npm run smoke:db`：数据库模式主链路冒烟
- `npm run smoke:challenge`：challenge 验证 + ticket 加榜冒烟
- `npm run smoke:ws`：WebSocket 实时 rank.updated 冒烟
- `npm run smoke:leave`：Leave Notice 报备闭环冒烟
- `npm run smoke:ops`：Notifications + Audit + Room Configs + Host Schedules 冒烟
