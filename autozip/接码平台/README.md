# 接码平台完整部署与对接手册

这是一份可直接交付、可二次部署的接码平台源码包，已经内置以下能力：

- `OpenTrashmail` 收信平台
- `Mail Bridge` 转接服务
- 管理员模式
- 根域名管理
- 随机邮箱
- 随机二级子域名邮箱

这份目录已经做过“干净交付”处理，不包含原来的真实域名、历史邮箱记录、旧密码或旧 token。

## 默认信息

- 访问密码：`123456`
- 管理员密码：`123456`
- 默认 Bridge Token：`123456`

首次部署成功后，强烈建议第一时间修改以上默认值。

## 目录结构

- [`docker-compose.yml`](./docker-compose.yml)
  Docker 编排文件，负责启动接码平台和 bridge 服务。
- [`.env`](./.env)
  主配置文件，包含域名、密码、bridge 地址等。
- [`.env.example`](./.env.example)
  配置模板。
- [`mail-bridge/mail_bridge_service.py`](./mail-bridge/mail_bridge_service.py)
  转接层服务，供你的注册软件调用。
- [`overrides/index.php`](./overrides/index.php)
  接码平台主入口覆盖文件。
- [`overrides/admin.html.php`](./overrides/admin.html.php)
  管理员模式页面。
- [`overrides/domain-manager.html.php`](./overrides/domain-manager.html.php)
  域名管理页面。
- [`data`](./data)
  邮件数据目录。首次部署时为空，运行后自动生成内容。

## 先理解整体架构

这套系统分成两部分：

1. 接码平台本体
   用来接收邮件、查看邮箱、读取验证码。

2. Mail Bridge
   用来把接码平台转换成你的注册软件可直接调用的接口。

你的注册软件并不是直接读 OpenTrashmail 的页面，而是调用 bridge。

整体链路如下：

```text
你的域名 MX / A / 反代
        ↓
接码平台 OpenTrashmail
        ↓
Mail Bridge
        ↓
你的注册软件 self_hosted_mail_api
```

## 一、你有一个域名后，应该先做什么

假设你已经有一个自己的域名，例如：

- `example.com`

你想实现两种邮箱：

- 根域名邮箱：`abc@example.com`
- 随机二级子域名邮箱：`abc@x7k2.example.com`

要实现这个目标，通常需要准备：

- 一个已备案或可用的域名
- 一个 DNS 服务商账号
- 一台服务器
- 这份接码平台源码

如果你用的是 Cloudflare，接下来按下面做。

## 二、域名绑定到 Cloudflare

### 1. 将域名接入 Cloudflare

1. 登录 Cloudflare
2. 点击 `Add a site`
3. 输入你的域名，例如 `example.com`
4. 选择一个方案
5. Cloudflare 会给你两条新的 NS 服务器记录
6. 到你的域名注册商后台，把原来的 NS 改成 Cloudflare 提供的 NS
7. 等待生效

当 Cloudflare 面板显示域名为 `Active` 时，说明接入完成。

## 三、Cloudflare 需要创建哪些 DNS 记录

下面给你一套最常见的配置思路。

假设：

- 服务器公网 IP：`1.2.3.4`
- 接码平台页面准备放在：`inbox.example.com`
- bridge 准备放在：`tools.example.com/mail-bridge`

### 1. 页面域名 A 记录

创建：

- 类型：`A`
- 名称：`inbox`
- 内容：`1.2.3.4`

得到：

- `inbox.example.com`

### 2. Bridge 域名 A 记录

创建：

- 类型：`A`
- 名称：`tools`
- 内容：`1.2.3.4`

得到：

- `tools.example.com`

### 3. 根域名邮箱所需 MX 记录

如果你希望 `@example.com` 直接收信，通常还需要让邮件路由指向你的服务器。

常见做法是创建：

- 类型：`MX`
- 名称：`@`
- 内容：`mail.example.com`
- 优先级：`10`

然后再创建：

- 类型：`A`
- 名称：`mail`
- 内容：`1.2.3.4`

### 4. 泛子域名邮箱所需通配 DNS

如果你要支持随机二级子域名邮箱，例如：

- `abc@k2d9.example.com`

那么建议增加：

- 类型：`MX`
- 名称：`*`
- 内容：`mail.example.com`
- 优先级：`10`

有些场景下还会补：

- 类型：`A`
- 名称：`*`
- 内容：`1.2.3.4`

但是否必须，要看你的邮件接收方案和面板要求。

## 四、Cloudflare 代理开关怎么选

### 对网页访问域名

例如：

- `inbox.example.com`
- `tools.example.com`

如果你要走反向代理和 HTTPS，通常可以开启 Cloudflare 代理。

### 对邮件相关记录

例如：

- `MX`
- `mail.example.com`

邮件相关记录通常不要走 Cloudflare 小黄云代理，应该保持 DNS Only。

简单理解：

- 网页入口可以代理
- 邮件投递记录不要代理

## 五、这份项目的关键配置项

主配置文件在：

- [`.env`](./.env)

默认内容大致如下：

```env
URL=http://localhost:8080
DOMAINS=example.com,*.example.com
DATEFORMAT=YYYY-MM-DD HH:mm:ss
DISCARD_UNKNOWN=true
SHOW_ACCOUNT_LIST=true
SKIP_FILEPERMISSIONS=true
DELETE_OLDER_THAN_DAYS=7
PASSWORD=123456
ADMIN_ENABLED=true
ADMIN_PASSWORD=123456
MAIL_BRIDGE_TOKEN=123456
MAIL_BRIDGE_PUBLIC_BASE=http://localhost:18762
```

### 每个字段的作用

- `URL`
  接码平台网页访问地址。

- `DOMAINS`
  接码平台允许接收的域名列表。

- `PASSWORD`
  普通访问密码。

- `ADMIN_ENABLED`
  是否开启管理员模式。

- `ADMIN_PASSWORD`
  管理员密码。

- `MAIL_BRIDGE_TOKEN`
  bridge 鉴权 token，注册软件需要用这个。

- `MAIL_BRIDGE_PUBLIC_BASE`
  bridge 对外访问地址。

## 六、如何填写 DOMAINS

### 只支持根域名邮箱

```env
DOMAINS=example.com
```

### 同时支持根域名和随机二级子域名邮箱

```env
DOMAINS=example.com,*.example.com
```

### 支持多个根域名混用

```env
DOMAINS=example.com,*.example.com,example.net,*.example.net
```

这意味着平台可以同时处理：

- `a@example.com`
- `b@x1.example.com`
- `c@example.net`
- `d@y9.example.net`

## 七、Windows 部署教程

### 方式一：推荐，使用 Docker Desktop

1. 安装 Docker Desktop
2. 确认 Docker 可以正常启动
3. 打开 PowerShell
4. 进入目录：

```powershell
cd "D:\自动化\接码平台"
```

5. 根据你的环境修改 [`.env`](./.env)
6. 启动服务：

```powershell
docker compose up -d
```

7. 查看状态：

```powershell
docker compose ps
```

8. 查看日志：

```powershell
docker compose logs -f
```

### 默认访问地址

- 接码平台页面：`http://localhost:8080`
- bridge 健康检查：`http://localhost:18762/healthz`

## 八、macOS 部署教程

### 方式一：Docker Desktop

1. 安装 Docker Desktop for Mac
2. 打开终端
3. 进入项目目录
4. 修改 `.env`
5. 启动：

```bash
docker compose up -d
```

6. 查看状态：

```bash
docker compose ps
```

7. 查看日志：

```bash
docker compose logs -f
```

### 访问

- 接码平台：`http://localhost:8080`
- bridge：`http://localhost:18762/healthz`

## 九、Linux 部署教程

Linux 最适合拿来正式部署。

### 1. 准备系统

推荐：

- Ubuntu 22.04+
- Debian 12+
- CentOS Stream 9+

### 2. 安装 Docker

如果你的系统还没有 Docker，可以先安装。

Ubuntu 常见命令：

```bash
sudo apt update
sudo apt install -y docker.io docker-compose-plugin
sudo systemctl enable docker
sudo systemctl start docker
```

### 3. 上传项目

把整个当前项目目录上传到服务器，例如：

- `/opt/mail-workspace`

### 4. 修改配置

编辑：

- `/opt/mail-workspace/.env`

建议改成类似：

```env
URL=https://inbox.example.com
DOMAINS=example.com,*.example.com
DATEFORMAT=YYYY-MM-DD HH:mm:ss
DISCARD_UNKNOWN=true
SHOW_ACCOUNT_LIST=true
SKIP_FILEPERMISSIONS=true
DELETE_OLDER_THAN_DAYS=7
PASSWORD=123456
ADMIN_ENABLED=true
ADMIN_PASSWORD=123456
MAIL_BRIDGE_TOKEN=replace-with-a-strong-token
MAIL_BRIDGE_PUBLIC_BASE=https://tools.example.com/mail-bridge
```

### 5. 启动

```bash
cd /opt/mail-workspace
sudo docker compose up -d
```

### 6. 查看状态

```bash
sudo docker compose ps
```

### 7. 查看日志

```bash
sudo docker compose logs -f
```

## 十、Mail Bridge 是怎么部署的

这份交付包已经把 bridge 一起放进 Docker 编排了。

也就是说你执行：

```bash
docker compose up -d
```

实际上会同时启动：

- `opentrashmail`
- `mail-bridge`

### Bridge 默认监听

- `18762`

### 作用

它会把接码平台的邮件数据转换成注册软件可以直接调用的接口，例如：

- `GET /healthz`
- `GET /api/latest?address=xxx@example.com`
- 管理员域名接口
- Mail Bridge 设置接口

## 十一、Bridge 部署完成后怎么验证

### 1. 验证健康检查

浏览器或命令行访问：

```text
http://127.0.0.1:18762/healthz
```

如果服务正常，应该返回 JSON。

### 2. 验证页面

访问：

```text
http://127.0.0.1:8080
```

输入默认密码：

- `123456`

### 3. 验证管理员模式

点击进入管理，输入管理员密码：

- `123456`

## 十二、如何反向代理

正式环境里，通常不建议把 `8080` 和 `18762` 直接裸露出去。

更常见做法是：

- `inbox.example.com` 反代到 `127.0.0.1:8080`
- `tools.example.com/mail-bridge` 反代到 `127.0.0.1:18762`

## 十三、Nginx 反向代理示例

### 1. 接码平台页面

```nginx
server {
    listen 80;
    server_name inbox.example.com;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 2. Bridge

```nginx
server {
    listen 80;
    server_name tools.example.com;

    location /mail-bridge/ {
        proxy_pass http://127.0.0.1:18762/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

如果你采用上面这种写法，那么你在 `.env` 里应当设置：

```env
MAIL_BRIDGE_PUBLIC_BASE=https://tools.example.com/mail-bridge
```

## 十四、HTTPS 怎么做

如果你用 Nginx，建议再配合：

- Certbot
- acme.sh
- 或 Cloudflare Tunnel / Zero Trust

只要最终能保证以下两个地址可用即可：

- `https://inbox.example.com`
- `https://tools.example.com/mail-bridge`

## 十五、部署好了之后，怎么对接你的注册软件

你的注册软件如果使用自建邮箱模式，应当填写：

```json
{
  "mail": {
    "provider": "self_hosted_mail_api",
    "api_base": "https://tools.example.com/mail-bridge",
    "api_key": "replace-with-your-own-token",
    "domain": "example.com",
    "domains": ["example.com"],
    "otp_timeout_seconds": 120,
    "poll_interval_seconds": 3
  }
}
```

### 字段解释

- `provider`
  固定填 `self_hosted_mail_api`

- `api_base`
  填你自己的 bridge 对外地址，不是别人的地址

- `api_key`
  对应 `.env` 里的 `MAIL_BRIDGE_TOKEN`

- `domain`
  主用域名

- `domains`
  可混合调用的域名列表

### 很重要

谁部署，谁就用自己的：

- `Mail Bridge API 地址`
- `Bridge Token`

不要继续写成别人的：

- `tools.xxx.com/mail-bridge`

否则注册软件会请求到别人的服务器。

## 十六、如果别人部署了这份接码平台，他怎么知道自己的 bridge 地址

部署后，原则非常简单：

- 如果本机直连，就看本机端口
- 如果做了反代，就看反代域名

例如：

- 本机直连：`http://127.0.0.1:18762`
- 反代后：`https://tools.example.com/mail-bridge`

你的注册软件要填的 `api_base`，就是这个地址。

## 十七、接码平台如何使用

### 普通模式

进入页面后输入访问密码，即可进入普通模式。

普通模式下可以：

- 查看自己的邮箱
- 生成随机邮箱
- 生成随机二级子域名邮箱
- 查看邮件详情
- 提取验证码

### 管理员模式

点击页面右上角进入管理，输入管理员密码，即可进入管理员模式。

管理员模式可以：

- 查看全量邮箱
- 打开域名管理页
- 查看 bridge 配置
- 维护平台配置

## 十八、主要功能说明

### 1. 按所选域名生成邮箱

会基于当前选中的根域名，生成一个随机邮箱，例如：

- `oc1234567890@example.com`

### 2. 按所选域名生成二级邮箱

如果该根域名启用了泛子域名能力，会生成类似：

- `oc1234567890@a1b2c3.example.com`

如果当前根域名没有启用泛子域名，则会退回生成根域名邮箱。

### 3. 打开输入邮箱

可以手动输入一个邮箱地址并打开该邮箱。

### 4. 域名管理

管理员模式下可以：

- 新增根域名
- 编辑根域名
- 启用或停用根域名
- 设置默认根域名
- 开启或关闭泛子域名
- 控制是否参与随机分配
- 控制是否出现在手动选择下拉中

## 十九、默认密码是什么

默认值如下：

- 页面访问密码：`123456`
- 管理员密码：`123456`
- Bridge Token：`123456`

## 二十、怎么改密码

修改文件：

- [`.env`](./.env)

把这些字段改掉：

```env
PASSWORD=你的新访问密码
ADMIN_PASSWORD=你的新管理员密码
MAIL_BRIDGE_TOKEN=你的新bridge token
```

修改完成后重启：

```bash
docker compose up -d
```

或者：

```bash
docker compose restart
```

## 二十一、改完密码后，注册软件要同步改什么

如果你只改了：

- `PASSWORD`
- `ADMIN_PASSWORD`

那么注册软件通常不用改。

如果你改了：

- `MAIL_BRIDGE_TOKEN`

那么注册软件里自建邮箱配置中的：

- `api_key`

也必须同步改成新 token。

## 二十二、推荐生产配置

正式环境建议这样：

```env
URL=https://inbox.example.com
DOMAINS=example.com,*.example.com
PASSWORD=replace-with-strong-password
ADMIN_PASSWORD=replace-with-strong-admin-password
MAIL_BRIDGE_TOKEN=replace-with-long-random-token
MAIL_BRIDGE_PUBLIC_BASE=https://tools.example.com/mail-bridge
```

## 二十三、常见问题

### 1. 为什么注册软件不能收验证码

先检查：

- 域名 DNS 是否生效
- MX 是否正确
- 服务器是否真的收到邮件
- bridge 是否正常启动
- 注册软件里的 `api_base` 和 `api_key` 是否正确

### 2. 为什么能打开页面但软件收不到验证码

通常是 bridge 配置问题：

- `api_base` 写错
- `MAIL_BRIDGE_TOKEN` 不一致
- 反代路径不一致

### 3. 为什么二级子域名邮箱生成了，但收不到

通常先检查：

- `DOMAINS` 里是否有 `*.example.com`
- DNS 是否有对应通配支持
- 邮件路由是否覆盖了子域名

### 4. 为什么别人部署后还连到我的服务器

因为注册软件里 `api_base` 还写着旧的 bridge 地址。

正确做法是改成对方自己部署后的地址。

## 二十四、交付给别人时你要重点提醒对方

部署方必须自己确认以下四项：

1. 自己的域名已接入 DNS 服务商
2. 自己的 DNS 记录已正确指向服务器
3. 自己的 `MAIL_BRIDGE_PUBLIC_BASE` 已改成自己的地址
4. 自己的注册软件 `api_base` 和 `api_key` 已改成自己的值

## 二十五、最小部署流程总结

如果你只想快速跑起来，最少做这些事：

1. 准备一台服务器
2. 准备一个域名
3. 在 Cloudflare 配好 A / MX 记录
4. 修改 [`.env`](./.env)
5. 执行 `docker compose up -d`
6. 用 Nginx 把页面和 bridge 反代出去
7. 在注册软件里填写自己的：
   `self_hosted_mail_api`
8. 测试一个邮箱是否能收到验证码

## 二十六、建议你部署完成后第一时间检查的地址

- 接码平台页面
- 管理员模式
- 域名管理页
- bridge 健康检查
- 注册软件自建邮箱配置

如果这五项都正常，整条链路基本就通了。
