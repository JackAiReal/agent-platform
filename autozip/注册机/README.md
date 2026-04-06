# gpt-auto

一个用于账号池维护的本地控制台，包含：

- Python 后端：`api_server.py`、`auto_pool_maintainer.py`
- React + Vite 前端：`frontend/`
- 一键托管脚本：`dev_services.sh`

它的核心能力包括：

- 探测和清理现有账号池
- 单次维护和循环补号
- 批量注册并输出标准化账号文件
- 本地登录页、配置面板、日志面板、输出目录管理

---

## 目录

1. 环境要求
2. 项目结构
3. 安装依赖
4. 准备配置文件
5. 启动项目
6. Linux / macOS 使用方式
7. Windows 使用方式
8. 配置说明
9. 环境变量
10. 常用命令
11. 日志与产物
12. 常见问题

---

## 1. 环境要求

建议环境：

- Python `3.10+`
- Node.js `18+`
- `pnpm` `8+`
- Bash

说明：

- 后端依赖安装在项目根目录的 `.venv/`
- 前端依赖安装在 `frontend/node_modules/`
- `dev_services.sh` 依赖 Bash，因此 Linux / macOS 可直接使用；Windows 原生 PowerShell 不适合直接跑这个脚本，建议手动分别启动前后端，或者使用 Git Bash / WSL

---

## 2. 项目结构

```txt
gpt-register-oss/
├─ api_server.py                  # 本地后端 API
├─ auto_pool_maintainer.py        # 账号池维护 / 批量注册核心逻辑
├─ config.example.json            # 示例配置
├─ config.self_hosted_mail_api.example.json
├─ requirements.txt               # Python 依赖
├─ dev_services.sh                # Linux/macOS 一键启动脚本
├─ frontend/                      # 前端控制台
│  ├─ package.json
│  ├─ src/
│  └─ vite.config.ts
├─ logs/                          # 运行日志
├─ output_tokens/                 # 批量注册输出目录
└─ admin_token.txt                # 登录页管理口令（首次运行后生成）
```

---

## 3. 安装依赖

### 3.1 Python 依赖

在项目根目录执行：

```bash
python3 -m venv .venv
./.venv/bin/pip install -r requirements.txt
```

如果你使用的是 Windows PowerShell：

```powershell
py -3 -m venv .venv
.\.venv\Scripts\pip.exe install -r requirements.txt
```

### 3.2 前端依赖

推荐使用 `pnpm`：

```bash
cd frontend
pnpm install
cd ..
```

如果你没有 `pnpm`，也可以先安装：

```bash
npm install -g pnpm
```

---

## 4. 准备配置文件

第一次使用先复制一份配置：

```bash
cp config.example.json config.json
```

Windows PowerShell：

```powershell
Copy-Item config.example.json config.json
```

如果你用的是自建邮箱桥接接口，也可以参考：

```txt
config.self_hosted_mail_api.example.json
```

### 4.1 最少要改哪些字段

至少要确认这些字段：

- `clean.base_url`
- `clean.token`
- `mail.provider`
- 对应邮箱 provider 的参数

否则前端虽然能打开，但维护和批量注册跑不起来。

### 4.2 最重要的配置项

#### `clean`

- `base_url`：你的 CPA / CLI 管理接口地址
- `token`：CPA / CLI 管理令牌
- `target_type`：目标账号类型，通常是 `codex`
- `used_percent_threshold`：清理阈值

#### `maintainer`

- `min_candidates`：可用号低于这个值时开始补号
- `loop_interval_seconds`：循环模式每轮间隔

#### `run`

- `workers`：注册并发
- `proxy`：代理地址，不需要可留空
- `failure_threshold_for_cooldown` / `failure_cooldown_seconds`：邮箱域名失败熔断

#### `mail`

- `provider`：支持：
  - `self_hosted_mail_api`
  - `cfmail`
  - `duckmail`
  - `tempmail_lol`
  - `yyds_mail`
- `otp_timeout_seconds`：验证码等待时长
- `poll_interval_seconds`：邮件轮询间隔

#### `output`

- 批量注册当前固定会把产物保存到本地 `output_tokens/`
- 循环补号不会因为这个逻辑把产物额外落到本地

---

## 5. 启动项目

### 5.1 推荐方式：一键启动

Linux / macOS：

```bash
./dev_services.sh fg
```

启动后：

- 前端地址：`http://127.0.0.1:8173`
- 后端 API：`http://127.0.0.1:8318`

首次启动后端会生成：

```txt
admin_token.txt
```

里面的内容就是登录页密码；如果你设置了环境变量 `APP_ADMIN_TOKEN`，则以后者为准，不要假定固定为某个默认值。

### 5.2 手动分别启动

如果你不想用托管脚本，也可以分别启动。

后端：

```bash
./.venv/bin/python api_server.py
```

前端：

```bash
cd frontend
pnpm dev
```

Windows PowerShell：

后端：

```powershell
.\.venv\Scripts\python.exe api_server.py
```

前端：

```powershell
cd frontend
pnpm dev
```

---

## 6. Linux / macOS 使用方式

### 6.1 Linux

以 Ubuntu / Debian 为例：

```bash
sudo apt update
sudo apt install -y python3 python3-venv python3-pip nodejs npm
npm install -g pnpm
```

然后：

```bash
python3 -m venv .venv
./.venv/bin/pip install -r requirements.txt
cd frontend && pnpm install && cd ..
cp config.example.json config.json
./dev_services.sh fg
```

### 6.2 macOS

推荐用 Homebrew：

```bash
brew install python node pnpm
```

然后：

```bash
python3 -m venv .venv
./.venv/bin/pip install -r requirements.txt
cd frontend && pnpm install && cd ..
cp config.example.json config.json
chmod +x dev_services.sh
./dev_services.sh fg
```

### 6.3 Linux / macOS 后台运行

```bash
./dev_services.sh bg
```

查看状态：

```bash
./dev_services.sh status
```

停止：

```bash
./dev_services.sh stop
```

重启：

```bash
./dev_services.sh restart
```

---

## 7. Windows 使用方式

### 7.1 推荐方式

Windows 下推荐：

- 用 PowerShell 手动分别启动前后端
- 或使用 Git Bash / WSL 再运行 `dev_services.sh`

### 7.2 PowerShell 手动启动

安装依赖：

```powershell
py -3 -m venv .venv
.\.venv\Scripts\pip.exe install -r requirements.txt
cd frontend
pnpm install
cd ..
Copy-Item config.example.json config.json
```

启动后端：

```powershell
.\.venv\Scripts\python.exe api_server.py
```

另开一个终端，启动前端：

```powershell
cd frontend
pnpm dev
```

### 7.3 Windows 下工程怎么打开

最常见的方式：

1. 用 VS Code 打开项目根目录
2. 一个终端跑后端
3. 另一个终端跑前端
4. 浏览器访问 `http://127.0.0.1:8173`
5. 登录密码看项目根目录下的 `admin_token.txt`

---

## 8. 配置说明

### 8.1 邮箱 provider 怎么填

### 8.1.1 前端界面字段和配置字段对照

前端“邮箱配置”卡片里最常见的字段，对应关系如下：

- `邮箱提供方` -> `mail.provider`
- `邮件 API 地址` / `接口地址` -> 对应 provider 的 `api_base`
- `邮件 API 密钥` / `接口密钥` / `访问凭证` -> 对应 provider 的 `api_key` 或 `bearer`
- `邮箱域名` -> 对应 provider 的 `domain`
- `邮箱域名列表` -> 对应 provider 的 `domains`
- `验证码超时（秒）` -> `mail.otp_timeout_seconds`
- `轮询间隔（秒）` -> `mail.poll_interval_seconds`

可以直接按下面这个理解来填：

- 如果界面写的是 `邮件 API 地址`，通常就是你邮件服务的接口根地址
- 如果界面写的是 `访问凭证`，在 `DuckMail` 模式下它实际对应的是 `bearer`
- 如果界面出现 `邮箱域名列表`，一行写一个域名
- 如果你只有 1 个域名，`domain` 和 `domains` 最稳的写法通常是都填这个域名

### 8.1.2 按前端界面最小可运行填写

#### `self_hosted_mail_api`（前端填写示例）

前端最少填写：

- `邮箱提供方`：`self_hosted_mail_api`
- `邮件 API 地址`
- `邮件 API 密钥`
- `邮箱域名`
- `邮箱域名列表`
- `验证码超时（秒）`
- `轮询间隔（秒）`

最小样例：

```txt
邮箱提供方: self_hosted_mail_api
邮件 API 地址: https://mail-api.example.com/bridge
邮件 API 密钥: your-api-key
邮箱域名: mail.example.com
邮箱域名列表:
mail.example.com
启用随机子域名: 否
子域名前缀长度: 6
验证码超时（秒）: 120
轮询间隔（秒）: 3
```

#### `self_hosted_mail_api`（配置字段）

需要：

- `mail.api_base`
- `mail.api_key`
- `mail.domain`
- `mail.domains`
- `mail.use_random_subdomain`
- `mail.random_subdomain_length`

说明：

- 只有一个域名时，`domain` 和 `domains` 建议都填同一个
- 自定义域名邮箱建议从 `2` 并发开始
- 如果你服务器已经支持泛子域名收信，可以把 `mail.use_random_subdomain` 打开
- 开启后实际邮箱会变成 `ocxxxx@随机前缀.你的根域名`
- `mail.domain` 和 `mail.domains` 这里仍然填写根域名，不要写成 `*.example.com`
- `mail.random_subdomain_length` 推荐先用 `6`

#### `cfmail`（前端填写示例）

前端最少填写：

- `邮箱提供方`：`CF Mail`
- `接口地址`
- `接口密钥`
- `邮箱域名`
- `邮箱域名列表`
- `启用随机子域名`
- `子域名前缀长度`
- `验证码超时（秒）`
- `轮询间隔（秒）`

最小样例：

```txt
邮箱提供方: CF Mail
接口地址: https://mail-worker.example.com
接口密钥: your-cfmail-key
邮箱域名: mail.example.com
邮箱域名列表:
mail.example.com
启用随机子域名: 是
子域名前缀长度: 6
验证码超时（秒）: 120
轮询间隔（秒）: 3
```

需要：

- `cfmail.api_base`
- `cfmail.api_key`
- `cfmail.domain`
- `cfmail.domains`
- `cfmail.use_random_subdomain`
- `cfmail.random_subdomain_length`

说明：

- `cfmail.domains` 不能为空
- 即使只有一个域名，也建议在 `domains` 里写一行
- Cloudflare 官方支持子域邮件路由，但你自己的 CF Mail 后端也必须真的支持子域收信，随机子域名才会收到验证码

#### `duckmail`（前端填写示例）

前端最少填写：

- `邮箱提供方`：`DuckMail`
- `访问凭证`
- `邮箱域名`
- `邮箱域名列表`
- `启用随机子域名`
- `子域名前缀长度`
- `验证码超时（秒）`
- `轮询间隔（秒）`

推荐一起填：

- `接口地址`

最小样例：

```txt
邮箱提供方: DuckMail
接口地址: https://api.duckmail.sbs
访问凭证: your-bearer
邮箱域名: example.com
邮箱域名列表:
example.com
启用随机子域名: 是
子域名前缀长度: 6
验证码超时（秒）: 120
轮询间隔（秒）: 3
```

最关键：

- `duckmail.bearer`

可配置：

- `duckmail.api_base`
- `duckmail.domain`
- `duckmail.domains`
- `duckmail.use_random_subdomain`
- `duckmail.random_subdomain_length`

说明：

- DuckMail 官方接口支持按完整 `address` 创建邮箱
- 想启用随机二级域名时，你填写的根域名必须已经在 DuckMail 侧验证通过并允许创建地址

#### `tempmail_lol`（前端填写示例）

前端最少填写：

- `邮箱提供方`：`TempMail.lol`
- `接口地址`
- `验证码超时（秒）`
- `轮询间隔（秒）`

最小样例：

```txt
邮箱提供方: TempMail.lol
接口地址: https://api.tempmail.lol/v2
验证码超时（秒）: 120
轮询间隔（秒）: 3
```

通常只需要：

- `tempmail_lol.api_base`

默认值一般就是：

```txt
https://api.tempmail.lol/v2
```

### 8.2 跳过手机号功能

前端高级设置里有两个重要开关：

- `批量注册允许仅 access_token 成功`
- `循环补号允许仅 access_token 成功`

作用：

- 注册阶段一旦拿到 `access_token` 就提前判成功
- 尽量不再进入后面容易命中 `add_phone` / `phone_verification` 的阶段

优点：

- 更容易绕开手机号验证
- 批量产号速度更快
- 失败率更低

缺点：

- 通常没有完整 `refresh_token`
- 额度面板可能不完整
- 更适合“先拿可用号”，不适合长期续期管理

---

## 9. 环境变量

后端支持这些环境变量：

- `APP_HOST`：后端监听地址，默认 `127.0.0.1`
- `APP_PORT`：后端端口，默认 `8318`
- `APP_DATA_DIR`：运行数据目录
- `APP_CONFIG_PATH`：配置文件路径
- `APP_LOG_DIR`：日志目录
- `APP_OUTPUT_TOKENS_DIR`：批处理输出目录
- `APP_ADMIN_TOKEN`：固定登录密码
- `APP_ADMIN_TOKEN_FILE`：登录密码文件路径

示例：

```bash
APP_HOST=0.0.0.0 APP_PORT=8318 ./.venv/bin/python api_server.py
```

---

## 10. 常用命令

### 10.1 托管脚本

```bash
./dev_services.sh fg
./dev_services.sh bg
./dev_services.sh stop
./dev_services.sh restart
./dev_services.sh status
```

### 10.2 单独执行维护

```bash
./.venv/bin/python auto_pool_maintainer.py --config config.json --log-dir logs
```

### 10.3 前端打包

```bash
cd frontend
pnpm build
```

---

## 11. 日志与产物

### 日志目录

- 维护日志：`logs/pool_maintainer_*.log`
- 流程追踪：`logs/flow-trace/`
- 托管脚本日志：`logs/dev-services/`

### 输出目录

- 批量注册输出：`output_tokens/`
- 历史兼容输出：`output_fixed/`

### 常见产物

- `output_tokens/cpa/`
- `output_tokens/subapi/`
- 批量下载 ZIP 由后端动态打包生成

### 登录信息

- 登录页口令文件：`admin_token.txt`

---

## 12. 常见问题

### 12.1 前端能打开但登录失败

先检查：

- `admin_token.txt` 里的值
- 是否设置了 `APP_ADMIN_TOKEN`

### 12.2 页面能打开但按钮没反应

先检查：

- 后端是否已启动
- `http://127.0.0.1:8318/api/health` 是否返回 `200`
- 浏览器是否就是从 `8173` 入口打开的

### 12.3 补号不触发

看日志里的：

```txt
清理后统计: candidates=... 阈值=...
```

如果 `candidates >= min_candidates`，系统不会补号。

### 12.4 下载账号压缩包失败

先确认：

- `output_tokens/cpa` 或 `output_tokens/subapi` 下是否真的有 `.json`
- 当前页面入口是否正确
- 后端 `8318` 是否可访问

### 12.5 出现手机号验证

去前端：

```txt
高级设置 -> 输出设置
```

开启：

- `批量注册允许仅 access_token 成功`
或
- `循环补号允许仅 access_token 成功`

### 12.6 macOS / Linux 无法执行脚本

给脚本加执行权限：

```bash
chmod +x dev_services.sh
```

---

## 安全提示

- `config.json`
- `admin_token.txt`
- 日志文件
- 输出目录中的账号文件

这些都可能包含敏感信息，不要公开上传。

如果你要对外分享工程，建议只保留：

- `config.example.json`
- `config.self_hosted_mail_api.example.json`

不要提交你自己的真实配置和账号产物。
