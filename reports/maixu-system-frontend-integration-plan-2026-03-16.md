# 排麦系统前端联调文档与页面对接顺序

> 时间：2026-03-16  
> 目标：基于当前已经落地的后端接口，整理一版给前端（微信小程序 / H5 / PC Web 共用 Taro 代码）可直接使用的联调文档，包括：
>
> - 页面划分
> - 页面对应接口
> - 页面初始化顺序
> - 请求时序
> - 数据结构建议
> - 前端状态管理建议

---

# 一、当前后端已可联调能力

当前后端已经具备以下可实际联调的接口能力：

## 1. 用户侧
- 登录
- 获取当前用户
- 房间列表
- 房间详情
- 当前档
- 当前榜单
- 加榜
- 取消加榜

## 2. 主持侧
- 主持控制台数据
- 手动加榜
- 作废 entry
- 转麦
- 重置本档
- 提前截手速
- 关闭最终报名
- 开关补排

## 3. 权限
- Bearer Token 登录态
- 主持接口需要 `HOST / ROOM_ADMIN / SUPER_ADMIN`

说明：
当前已经足够支持前端开始做 **第一版用户端页面 + 第一版主持台页面**。

---

# 二、推荐前端页面拆分

## 2.1 用户端页面

建议第一版先做 5 个核心页面：

### 1）登录页 / 启动页
职责：
- 微信小程序登录
- H5/PC demo 登录
- 拉取当前用户信息

### 2）房间列表页
职责：
- 展示房间列表
- 展示当前房间是否开档
- 展示当前排麦人数
- 点击进入房间详情

### 3）房间详情页
职责：
- 展示当前档期
- 展示当前榜单
- 展示房间规则摘要
- 用户在这里发起排麦 / 取消排麦

### 4）我的状态浮层 / 卡片
职责：
- 我是否已在榜中
- 我的当前排名
- 当前 entry 信息
- 能否取消

### 5）操作反馈页 / Toast 体系
职责：
- 排麦成功 / 失败
- 分数不够
- 已截止
- 权限不足

---

## 2.2 主持端页面

建议第一版先做 3 个页面：

### 1）主持控制台页
职责：
- 当前档信息
- 榜单摘要
- 顶部快捷操作
- 档期控制按钮

### 2）榜单管理页
职责：
- entry 列表
- 对每个 entry 执行：作废 / 转麦
- 手动加榜
- 重置本档

### 3）档期控制页
职责：
- 提前截手速
- 关闭最终报名
- 开关补排

实际上第一版也可以把 2 和 3 合并进主持控制台页。

---

# 三、推荐页面路由结构

如果你用 Taro + React，建议先这样分：

```text
/pages
  /auth/login
  /rooms/index
  /rooms/detail
  /host/dashboard
```

配合 query 参数：

- `/rooms/detail?roomId=xxx`
- `/host/dashboard?slotId=xxx`

移动端和 PC 端可共用这套路由，差别只在布局层。

---

# 四、前端状态管理建议

建议按领域拆 store，而不是按页面拆。

## 4.1 authStore
保存：
- accessToken
- 当前用户信息
- 是否已登录

## 4.2 roomStore
保存：
- 房间列表
- 当前房间详情
- 当前 slot

## 4.3 rankStore
保存：
- 当前榜单 entries
- topEntries
- 我的 rank
- 当前 slot summary

## 4.4 hostStore
保存：
- 主持控制台数据
- 当前操作 loading 状态
- 当前 slot 控制状态

## 4.5 wsStore
保存：
- websocket 连接状态
- 当前订阅的 roomId / slotId
- 最近一次 rank 更新版本

---

# 五、当前可直接联调的接口映射

## 5.1 登录相关

### 登录（demo / 小程序占位）
`POST /api/v1/auth/dev-login`
或
`POST /api/v1/auth/wechat-mini/login`

请求：
```json
{
  "nickname": "张三"
}
```

返回：
```json
{
  "accessToken": "xxx",
  "tokenType": "Bearer",
  "user": {
    "id": "user-id",
    "nickname": "张三",
    "createdAt": "..."
  }
}
```

前端处理：
- 保存 `accessToken`
- 保存 `user`
- 后续请求统一带：
  `Authorization: Bearer ${accessToken}`

---

### 获取当前用户
`GET /api/v1/auth/me`

用途：
- 页面刷新后恢复用户信息
- 检查 token 是否可用

---

## 5.2 房间相关

### 获取房间列表
`GET /api/v1/rooms`

返回重点字段：
- `id`
- `code`
- `name`
- `description`
- `isActive`
- `config`
- `currentSlot`
- `currentRankCount`

前端展示建议：
- 房间名
- 当前档 hour
- 当前榜人数
- 是否满榜

---

### 获取房间详情
`GET /api/v1/rooms/:roomId`

返回重点字段：
- 房间基本信息
- 当前档 `currentSlot`
- 当前榜人数 `currentRankCount`
- `topEntries`

前端用途：
- 房间页头部信息
- 房间卡片展开页

---

### 获取当前档
`GET /api/v1/rooms/:roomId/current-slot`

前端用途：
- 单独刷新当前档状态
- 页面进入时快速拿 slotId

---

## 5.3 榜单相关

### 获取档期榜单
`GET /api/v1/slots/:slotId/rank`
或
`GET /api/v1/rank/slots/:slotId`

返回重点字段：
- `slot`
- `room`
- `entries`
- `topEntries`
- `maxRank`

`entries[]` 结构示例：
```json
{
  "rank": 1,
  "id": "entry-id",
  "roomSlotId": "slot-id",
  "userId": "user-id",
  "user": {
    "id": "user-id",
    "nickname": "演示主持"
  },
  "sourceType": "MANUAL",
  "sourceContent": "固定档",
  "score": 999,
  "status": "ACTIVE",
  "inTop": true,
  "createdAt": "...",
  "updatedAt": "..."
}
```

前端用途：
- 用户房间页榜单
- 主持控制台榜单
- 个人 entry 查找

---

### 加榜
`POST /api/v1/rank/slots/:slotId/join`

请求：
```json
{
  "userId": "当前用户ID",
  "sourceContent": "任务A",
  "score": 20
}
```

返回：
- 是否成功
- 当前 entry
- 当前排名
- 最新榜单 `currentRank`

前端处理：
- 成功后直接用返回的 `currentRank` 覆盖本地榜单
- 不必再立刻二次请求

---

### 取消加榜
`POST /api/v1/rank/slots/:slotId/cancel`

请求：
```json
{
  "userId": "当前用户ID"
}
```

前端处理：
- 成功后更新榜单
- 清空“我的 entry”状态

---

## 5.4 主持控制台相关

### 主持控制台数据
`GET /api/v1/slots/:slotId/host-dashboard`

需要：
- Bearer Token
- 当前用户必须是 HOST / ROOM_ADMIN / SUPER_ADMIN

返回：
- `slot`
- `room`
- `summary`
- `entries`
- `topEntries`

`summary` 示例：
```json
{
  "totalEntries": 1,
  "topCount": 1,
  "maxRank": 7,
  "state": "OPEN",
  "isFull": false
}
```

前端用途：
- 主持页顶部概览
- 榜单总数
- 当前档状态
- 是否已满

---

### 手动加榜
`POST /api/v1/rank/slots/:slotId/manual-add`

请求：
```json
{
  "userId": "目标用户ID",
  "sourceContent": "手动加麦",
  "score": 999
}
```

用途：
- 主持手动上榜

---

### 作废榜单项
`POST /api/v1/rank/slots/:slotId/invalidate-entry`

请求：
```json
{
  "entryId": "entry-id"
}
```

用途：
- 主持作废当前 entry

---

### 转麦
`POST /api/v1/rank/slots/:slotId/transfer-entry`

请求：
```json
{
  "entryId": "entry-id",
  "toUserId": "目标用户ID"
}
```

用途：
- 主持将某个榜单项转给另一个用户

---

### 重置本档
`POST /api/v1/rank/slots/:slotId/reset-slot`

用途：
- 清空当前档 active 榜单
- slot 状态回到 OPEN

---

## 5.5 档期控制相关

### 提前截手速
`POST /api/v1/slots/:slotId/close-speed-stage`

效果：
- slot.state → `FINAL_OPEN`

---

### 关闭最终报名
`POST /api/v1/slots/:slotId/close-final-stage`

效果：
- slot.state → `FINAL_CLOSED`

---

### 开关补排
`POST /api/v1/slots/:slotId/toggle-add-stage`

请求：
```json
{
  "enabled": true
}
```

效果：
- `true` → `FINAL_OPEN`
- `false` → `FINAL_CLOSED`

---

# 六、用户端页面联调顺序

建议用户端按下面顺序接，不容易乱。

## 第 1 步：登录页

### 页面初始化流程
1. 用户输入昵称 / 微信登录
2. 调 `POST /auth/dev-login` 或 `POST /auth/wechat-mini/login`
3. 保存 token
4. 调 `GET /auth/me`
5. 跳房间列表页

### 前端产物
- `useAuth()`
- `authStore`
- request 拦截器自动带 token

---

## 第 2 步：房间列表页

### 页面请求顺序
1. 调 `GET /rooms`
2. 渲染卡片列表
3. 点击某房间进入详情页

### 建议展示字段
- 房间名
- 描述
- 当前档小时
- 当前榜人数
- 当前是否开档

---

## 第 3 步：房间详情页

### 页面请求顺序
1. 取 `roomId`
2. 调 `GET /rooms/:roomId`
3. 拿到 `currentSlot.id`
4. 调 `GET /slots/:slotId/rank`
5. 渲染当前榜单

### 页面元素建议
- 房间信息卡
- 当前档卡
- 榜单列表
- “我要排麦”按钮
- “取消排麦”按钮
- 我的状态卡片

---

## 第 4 步：用户加榜 / 取消加榜

### 加榜流程
1. 用户点击某个任务按钮或输入任务
2. 调 `POST /rank/slots/:slotId/join`
3. 成功后直接用返回的 `currentRank` 更新榜单
4. 更新本地“我的状态”

### 取消流程
1. 点击取消
2. 调 `POST /rank/slots/:slotId/cancel`
3. 用返回的 `currentRank` 覆盖本地榜单

---

# 七、主持端页面联调顺序

建议主持端先做一个**单页控制台**，不要一开始拆太多页。

## 第 1 步：主持控制台页

### 页面请求顺序
1. 登录后进入主持台
2. 根据房间或当前档拿到 `slotId`
3. 调 `GET /slots/:slotId/host-dashboard`
4. 渲染：
   - 当前档状态
   - 榜单
   - 操作按钮

### 顶部建议展示
- 当前房间名
- 当前档 hour
- 当前状态
- 总榜人数
- 是否满榜

---

## 第 2 步：榜单操作区

对每条 entry 提供按钮：
- 作废
- 转麦

### 作废流程
1. 点击“作废”
2. 调 `POST /rank/slots/:slotId/invalidate-entry`
3. 用返回的 `currentRank` 刷榜

### 转麦流程
1. 点击“转麦”
2. 选择目标用户
3. 调 `POST /rank/slots/:slotId/transfer-entry`
4. 用返回的 `currentRank` 刷榜

---

## 第 3 步：手动控制区

按钮建议：
- 手动加榜
- 重置本档
- 提前截手速
- 关闭最终报名
- 开启/关闭补排

### 手动加榜
调：
`POST /rank/slots/:slotId/manual-add`

### 重置本档
调：
`POST /rank/slots/:slotId/reset-slot`

### 提前截手速
调：
`POST /slots/:slotId/close-speed-stage`

### 关闭最终报名
调：
`POST /slots/:slotId/close-final-stage`

### 开关补排
调：
`POST /slots/:slotId/toggle-add-stage`

---

# 八、前端请求时序建议

## 8.1 用户进入房间页

```text
进入房间页
  ↓
GET /rooms/:roomId
  ↓
拿 currentSlot.id
  ↓
GET /slots/:slotId/rank
  ↓
渲染榜单
  ↓
建立 ws（可后接）
```

## 8.2 用户点击加榜

```text
点击任务按钮
  ↓
POST /rank/slots/:slotId/join
  ↓
返回 currentRank
  ↓
覆盖本地 rankStore
  ↓
更新我的状态
```

## 8.3 主持打开主持台

```text
进入主持页
  ↓
GET /slots/:slotId/host-dashboard
  ↓
渲染榜单 + summary
  ↓
点击操作
  ↓
POST 控制接口
  ↓
使用返回的 currentRank 或重新拉 host-dashboard
```

---

# 九、前端数据结构建议

## 9.1 榜单实体建议前端统一成这个类型

```ts
export interface RankEntryVO {
  rank: number;
  id: string;
  roomSlotId: string;
  userId: string;
  user?: {
    id: string;
    nickname: string;
    avatarUrl?: string;
    createdAt?: string;
  };
  sourceType: string;
  sourceContent: string;
  score: number;
  status: string;
  inTop: boolean;
  createdAt: string;
  updatedAt: string;
}
```

## 9.2 当前档类型建议

```ts
export interface SlotVO {
  id: string;
  roomId: string;
  slotDate: string;
  slotHour: number;
  startAt: string;
  speedCloseAt: string;
  finalCloseAt: string;
  state: string;
  isFull: boolean;
}
```

## 9.3 房间类型建议

```ts
export interface RoomVO {
  id: string;
  code: string;
  name: string;
  description?: string;
  isActive: boolean;
  config: {
    maxRank: number;
    orderStartMinute: number;
    orderStopMinute: number;
  };
}
```

## 9.4 主持控制台类型建议

```ts
export interface HostDashboardVO {
  slot: SlotVO;
  room: RoomVO;
  summary: {
    totalEntries: number;
    topCount: number;
    maxRank: number;
    state: string;
    isFull: boolean;
  };
  entries: RankEntryVO[];
  topEntries: RankEntryVO[];
}
```

---

# 十、前端错误处理建议

前端至少要统一处理这几类错误：

## 10.1 401
表示：
- token 失效
- 没登录

处理：
- 清空登录态
- 跳转登录页

## 10.2 403
表示：
- 权限不足

处理：
- Toast：你没有主持权限
- 不要死循环重试

## 10.3 404
表示：
- 房间不存在
- slot 不存在
- entry 不存在

处理：
- 返回上一页
- Toast：数据不存在或已失效

## 10.4 业务失败
比如：
- 分数不够
- 已截止
- 找不到用户

处理：
- 弹业务提示
- 不要吞错误

---

# 十一、前端第一阶段最小联调清单

推荐按这个 checklist 往前推进：

## 用户端
- [ ] 登录页
- [ ] 房间列表页
- [ ] 房间详情页
- [ ] 榜单渲染
- [ ] 加榜
- [ ] 取消加榜
- [ ] 我的状态展示

## 主持端
- [ ] 主持台基础页
- [ ] host-dashboard 接通
- [ ] 作废按钮
- [ ] 转麦按钮
- [ ] 手动加榜
- [ ] 重置本档
- [ ] 提前截手速
- [ ] 开关补排

---

# 十二、建议的前端对接顺序（最终版）

最推荐的顺序是：

## 第 1 阶段：用户基础链路
1. 登录
2. 房间列表
3. 房间详情
4. 榜单展示
5. 加榜/取消

## 第 2 阶段：主持控制台
1. host-dashboard
2. 作废
3. 转麦
4. 手动加榜
5. 重置本档
6. 截手速/补排

## 第 3 阶段：实时联动
1. WebSocket 接入
2. 榜单自动刷新
3. 主持操作同步

## 第 4 阶段：补 challenge 与报备
1. challenge 页面
2. 报备页面
3. 通知联动

---

# 十三、结论

当前后端已经足够前端启动第一版联调。  
最适合前端立刻接的页面是：

- **房间列表页**
- **房间详情页**
- **主持控制台页**

建议策略：

> 先把“可操作的静态流程”接通，再补 WebSocket 和 challenge。  
> 不要一开始追求所有玩法都在线，否则前端会被接口变动拖死。

如果继续往下走，下一步最值得补的是：

1. **给前端输出一版 TypeScript API SDK / 类型文件**
2. **给 Taro 页面生成第一版页面骨架与 hooks 结构**

这两步做完，前端就能明显提速。
