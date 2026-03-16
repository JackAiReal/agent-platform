# 自动化模块服务端下发方案（方案 C）后端接口需求

## 目标

客户端不再从本地明文 `xx.js` 加载自动化模块，改为：

1. 客户端登录会员系统
2. 选择某个平台（如 咪鸭 / 捞月狗）
3. 向服务端申请该平台的临时模块包
4. 服务端返回：
   - 加密后的模块代码
   - 临时密钥包装数据
   - 过期时间 / 版本 / 绑定信息
5. 客户端只在内存中解密执行
6. 不落地明文 js 文件

---

## 设计原则

### 必须满足

- 模块按平台单独发放
- 必须校验登录态
- 必须校验当前账号是否有权限使用该项目
- 返回的模块包必须有 TTL
- 模块包必须绑定设备（至少绑定 `android_id`）
- 模块代码必须加密
- 模块包必须有完整性校验/签名
- 支持禁用某个平台模块
- 支持版本控制和灰度升级

### 安全目标

- 防止直接在目录里看到明文自动化 js
- 防止模块包长期复用
- 防止简单拷贝到别的设备继续运行
- 防止被人随便篡改模块内容

---

# 一、推荐客户端调用流程

## 流程 1：查询支持列表（可选但推荐）

客户端启动后可先请求支持的平台列表：

`GET /automation/modules/support`

作用：
- 判断某个平台是否支持
- 拿到最新版本号
- 拿到最小客户端版本要求

## 流程 2：申请临时模块包（核心）

客户端点击启动某个平台时：

`POST /automation/modules/lease`

服务端校验：
- Bearer token 是否有效
- 当前账号是否有对应项目权限
- 当前平台模块是否启用
- 当前客户端版本是否满足最小要求
- 当前设备是否允许

校验通过后，返回：
- 模块密文
- 模块临时密钥包装信息
- 过期时间
- 平台版本信息

客户端收到后：
- 在内存中解密
- `new Function(...)` 加载执行
- 不写明文到磁盘

---

# 二、接口定义

## 1）查询支持模块列表

### 接口

`GET /automation/modules/support`

### 请求头

```http
Authorization: Bearer <access_token>
```

### 查询参数

```http
?source_app_code=IdBotAuto&android_id=<android_id>&script_version=2.0.5
```

### 返回示例

```json
{
  "code": 0,
  "data": {
    "source_app_code": "IdBotAuto",
    "modules": [
      {
        "module_name": "咪鸭",
        "module_code": "miya",
        "enabled": true,
        "latest_version": "2026.03.16.1",
        "min_client_version": "2.0.5"
      },
      {
        "module_name": "捞月狗",
        "module_code": "laoyuegou",
        "enabled": true,
        "latest_version": "2026.03.16.1",
        "min_client_version": "2.0.5"
      },
      {
        "module_name": "PP",
        "module_code": "pp",
        "enabled": false,
        "latest_version": null,
        "min_client_version": "2.0.5"
      }
    ]
  }
}
```

### 说明

- `module_name`：当前客户端可直接使用的名字（和 UI 选项一致）
- `module_code`：服务端内部稳定标识，建议保留
- `enabled=false` 表示暂不支持

---

## 2）申请临时模块包

### 接口

`POST /automation/modules/lease`

### 请求头

```http
Authorization: Bearer <access_token>
Content-Type: application/json
```

### 请求体

```json
{
  "module_name": "咪鸭",
  "module_code": "miya",
  "source_app_code": "IdBotAuto",
  "android_id": "abc123456789",
  "script_version": "2.0.5",
  "client_nonce": "base64-random-16bytes",
  "device_fingerprint": "optional",
  "package_name": "com.stardust.autojs",
  "platform": "android"
}
```

### 字段要求

- `module_name`：当前客户端直接传 UI 里的平台名
- `module_code`：可选，但推荐也传
- `source_app_code`：当前项目标识，例如 `IdBotAuto`
- `android_id`：必须
- `script_version`：必须
- `client_nonce`：必须，客户端随机 16~32 bytes 后 base64
- `device_fingerprint`：可选
- `package_name`：可选
- `platform`：可选

### 返回示例

```json
{
  "code": 0,
  "data": {
    "lease_id": "mod_lease_xxx",
    "module_name": "咪鸭",
    "module_code": "miya",
    "module_version": "2026.03.16.1",
    "expires_at": "2026-03-16T22:20:30Z",
    "crypto": {
      "cipher": "aes-256-gcm",
      "kdf": "hkdf-sha256",
      "server_nonce": "base64-server-nonce",
      "iv": "base64-iv",
      "tag": "base64-tag",
      "ciphertext": "base64-ciphertext",
      "wrapped_key_iv": "base64-wrapped-key-iv",
      "wrapped_key_tag": "base64-wrapped-key-tag",
      "wrapped_key": "base64-wrapped-key",
      "aad": "base64-json-aad"
    },
    "meta": {
      "source_app_code": "IdBotAuto",
      "android_id_bound": true,
      "content_sha256": "hex",
      "min_client_version": "2.0.5"
    }
  }
}
```

---

# 三、服务端加密方案要求

## 推荐方案

- 模块正文加密：`AES-256-GCM`
- 临时模块密钥包装：`AES-256-GCM`
- 会话密钥派生：`HKDF-SHA256`

## 推荐服务端逻辑

### 第一步：生成随机模块密钥

服务端每次请求都生成新的随机 `module_key`（32 bytes）

### 第二步：用 `module_key` 加密模块源码

对模块源码（js 字符串）执行：
- 可选：先 gzip/deflate 压缩
- 再 AES-256-GCM 加密
- 得到：`ciphertext + iv + tag`

### 第三步：派生会话密钥 `session_key`

服务端根据以下信息派生会话密钥：

- `access_token`（建议取 hash，不直接存原文）
- `MEMBERSHIP_APP_SECRET`
- `android_id`
- `client_nonce`
- `server_nonce`
- `lease_id`

例如：

```text
base_secret = SHA256(access_token + "|" + app_secret + "|" + android_id)
session_key = HKDF_SHA256(
  ikm = base_secret,
  salt = lease_id + "|" + server_nonce + "|" + client_nonce,
  info = "automation-module-session-v1"
)
```

### 第四步：用 `session_key` 包装 `module_key`

得到：
- `wrapped_key`
- `wrapped_key_iv`
- `wrapped_key_tag`

这样客户端需要：
1. 自己根据同样规则派生 `session_key`
2. 先解出 `module_key`
3. 再解出模块 js 代码

---

# 四、服务端校验规则

服务端在发放模块前必须做这些检查：

## 1. 登录态检查
- Bearer token 必须有效
- 对应用户必须存在
- 账号状态正常

## 2. 权限检查
- 检查 `entitlements/me`
- 必须确认当前账号对 `source_app_code=IdBotAuto` 有有效权限
- 没有权限则拒绝发放模块

## 3. 模块支持检查
- 平台模块必须存在
- 模块必须启用
- 模块必须允许当前项目使用

## 4. 版本检查
- `script_version` 小于 `min_client_version` 时拒绝
- 返回明确提示“客户端版本过低”

## 5. 设备绑定
- 模块包必须绑定 `android_id`
- 建议服务端记录：
  - user_id
  - module_name
  - source_app_code
  - android_id
  - lease_id
  - expires_at

## 6. 频率限制

建议加限流：
- 同一用户 + 同一模块：10 秒内最多 3 次
- 同一设备：1 分钟内最多 10 次
- 防止刷接口和批量拉包

---

# 五、错误码要求

后端请统一返回明确错误：

### 401

```json
{ "code": 401, "message": "登录已失效，请重新登录" }
```

### 403

```json
{ "code": 403, "message": "当前账号无权限使用该项目模块" }
```

### 404

```json
{ "code": 404, "message": "未找到对应自动化模块" }
```

### 409

```json
{ "code": 409, "message": "当前模块已禁用或暂不支持" }
```

### 426

```json
{ "code": 426, "message": "客户端版本过低，请升级后使用" }
```

### 429

```json
{ "code": 429, "message": "请求过于频繁，请稍后重试" }
```

---

# 六、数据库/存储建议

## 表 1：automation_modules

用于记录当前可发放的模块版本

字段建议：
- `id`
- `module_name` 例如：咪鸭
- `module_code` 例如：miya
- `source_app_code` 例如：IdBotAuto
- `version`
- `enabled`
- `min_client_version`
- `content_plain` 或 `content_blob`
- `content_sha256`
- `created_at`
- `updated_at`

> 如果不想存明文，可存服务端主密钥加密后的源码。

## 表 2：automation_module_leases

记录每次临时发放

字段建议：
- `id`
- `lease_id`
- `user_id`
- `module_name`
- `module_code`
- `module_version`
- `source_app_code`
- `android_id`
- `client_nonce`
- `server_nonce`
- `expires_at`
- `used_at`
- `status`（issued / expired / consumed / revoked）
- `ip`
- `ua`
- `created_at`

## 表 3：automation_module_access_logs

审计日志

字段建议：
- `id`
- `user_id`
- `module_name`
- `source_app_code`
- `android_id`
- `result`
- `error_code`
- `error_message`
- `created_at`

---

# 七、客户端兼容要求

后端实现时请注意，客户端当前是：

- 登录后持有 `access_token`
- 选择平台名（目前是中文名）
- 准备按平台名请求模块
- 收到模块后在内存里加载执行

所以后端第一版建议：
- 先兼容 `module_name` 中文名直接查找
- 同时保留 `module_code` 字段
- 后续客户端再慢慢切换成以 `module_code` 为准

---

# 八、最低可用版本（MVP）

如果想先快速落地，后端至少实现这 2 个接口：

## 必做
1. `GET /automation/modules/support`
2. `POST /automation/modules/lease`

## 先不做也能跑
- 上报执行结果
- 灰度发布
- 模块分组
- 多项目共享模块

---

# 九、建议给后端 agent 的一句话任务描述

你可以直接把下面这段发给它：

> 请在 membership 后端新增一套“自动化模块临时发放”接口。目标是：客户端选择某个平台后，不再从本地明文 js 加载，而是通过登录态向后端申请临时模块包。后端需要实现：
> 1. 查询支持模块列表 `GET /automation/modules/support`
> 2. 发放临时模块包 `POST /automation/modules/lease`
> 3. 校验 Bearer token、项目权限 entitlement、模块启用状态、最小客户端版本
> 4. 返回 AES-256-GCM 加密后的模块代码 + 通过 HKDF 派生会话密钥包装后的临时 module_key
> 5. 绑定 android_id，模块包带 expires_at，支持限流和审计日志
> 6. 第一版兼容客户端按中文 `module_name` 请求模块，同时保留 `module_code` 设计
