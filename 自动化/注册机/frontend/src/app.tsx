import {
  Alert,
  App as AntdApp,
  Button,
  Card,
  Col,
  ConfigProvider,
  Divider,
  Drawer,
  Flex,
  Form,
  Input,
  InputNumber,
  Layout,
  List,
  Modal,
  Progress,
  Row,
  Segmented,
  Select,
  Space,
  Spin,
  Statistic,
  Steps,
  Switch,
  Tag,
  Timeline,
  theme,
  Typography,
} from "antd";
import {
  ApiOutlined,
  CopyOutlined,
  DatabaseOutlined,
  DeleteOutlined,
  DownloadOutlined,
  FileTextOutlined,
  FieldTimeOutlined,
  FilterOutlined,
  FolderOpenOutlined,
  LockOutlined,
  LogoutOutlined,
  MailOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  SaveOutlined,
  SettingOutlined,
  StopOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { useEffect, useMemo, useRef, useState } from "react";
import { defaultBackendConfig, normalizeBackendConfig } from "./lib/config-schema";
import {
  clearAuthToken,
  checkMailDomainRegistry,
  fetchBatchState,
  fetchBackendConfig,
  fetchMonitorState,
  fetchOutputInventoryState,
  getStoredAuth,
  isAuthError,
  saveBackendConfig,
  startBatchRuntime,
  startRuntime,
  startRuntimeLoop,
  stopBatchRuntime,
  stopRuntime,
  storeAuthToken,
  downloadOutputArchive,
  clearOutputInventory,
  updateAdminToken,
  verifyAuthToken,
} from "./services/api";
import type { BackendConfig, MailDomainRegistryCheckResponse } from "./types/api";
import type { BatchMonitorState, LogLine, MonitorState, OutputInventoryState } from "./types/runtime";

const { Header, Content } = Layout;
const { Title, Text } = Typography;

type LogTone = "all" | "success" | "warning" | "danger" | "info" | "muted";
type RuntimeMode = "idle" | "single" | "loop";
type LogScope = "maintainer" | "batch";
type ProviderSnapshotFields = {
  mailApiBase: string;
  mailApiKey: string;
  mailDomain: string;
  mailDomains: string;
  mailMixDomainRotation: boolean;
  mailUseRandomSubdomain: boolean;
  mailRandomSubdomainLength: number;
};

type DomainRegistryState = {
  loading: boolean;
  result: MailDomainRegistryCheckResponse | null;
  error: string;
};

const USER_GUIDE_MARKDOWN = [
  "# 账号池维护控制台使用说明",
  "",
  "> 适用于当前登录页与控制台界面。建议首次使用时先看完“快速开始”和“邮箱配置”两节。",
  "",
  "## 一、快速开始",
  "",
  "1. 先在登录页输入管理令牌进入控制台。",
  "2. 在 **核心配置** 中填写 CPA 地址和访问令牌。",
  "3. 在 **邮箱配置** 中选择邮箱 Provider，并补齐对应参数。",
  "4. 点击顶部 **保存配置**。",
  "5. 根据需要选择：",
  "   - **单次维护**：执行一轮清理 + 补号",
  "   - **循环补号**：持续巡检并自动维持库存",
  "   - **开始批处理**：按目标数量输出标准化 JSON 产物",
  "",
  "## 二、王炸功能：跳过手机号",
  "",
  "- 推荐入口：**高级设置 -> 输出设置 -> 批量注册允许仅 access_token 成功**，以及 **循环补号允许仅 access_token 成功**。",
  "- 作用：注册阶段只要已经拿到 access_token，就直接判成功并产出兼容增强版 JSON，不再强制进入后续 OAuth 补全。",
  "- 批量注册：无论是否开启 access-only，都只保留本地成品和压缩包下载，不自动推送到 CPA。",
  "- 循环补号 access-only：仍可继续推送到 CPA，适合你只追求可用号和请求统计的场景。",
  "- 适合场景：批量注册、循环补号、短期消耗型账号、你更关心请求成功率和产出速度，而不是刷新额度。",
  "- 最大价值：很多原本会在 OAuth 后半段命中手机号验证的账号，在这里可以直接跳过去，显著提升批量产出效率。",
  "- 已知边界：这类账号通常没有 refresh_token，所以**不能指望额度面板完整刷新**，更适合直接使用和请求统计，不适合长期续期管理。",
  "",
  "### 如果出现“需要手机号验证”怎么办",
  "",
  "1. 先进入 **高级设置 -> 输出设置**。",
  "2. 如果你现在跑的是 **批量注册**，打开 **批量注册允许仅 access_token 成功**。",
  "3. 如果你现在跑的是 **单次维护 / 循环补号**，打开 **循环补号允许仅 access_token 成功**。",
  "4. 点击顶部 **保存配置**。",
  "5. 再重新启动对应任务。",
  "",
  "- 工作原理：一旦注册阶段已经拿到 access_token，系统就直接把账号判定为成功，不再强制继续走容易命中手机号验证的后半段。",
  "- 好处：显著减少因为 add phone / phone verification 导致的整号失败，特别适合批量产号和补号提速。",
  "- 弊端：这类账号往往没有 refresh_token，所以额度面板、续期能力和完整账号信息会弱一些。",
  "- 最适合：你当前更在意“先把可用号产出来”，而不是“长期维护同一个号的刷新额度”。",
  "",
  "## 三、登录页功能",
  "",
  "### 管理登录",
  "",
  "- 用途：输入 `X-Admin-Token` 进入控制台。",
  "- 首次启动：系统会在后端运行目录生成 `admin_token.txt`，请以文件中的密码为准；如设置了 `APP_ADMIN_TOKEN`，则以后者为准。",
  "- 修改入口：进入控制台后，在 **高级设置 -> 访问安全** 中可修改登录页密码。",
  "",
  "### 使用说明",
  "",
  "- 用途：打开当前这份帮助文档。",
  "- 适合场景：",
  "  - 首次部署后不清楚先配什么",
  "  - 忘记某个邮箱 Provider 需要哪些参数",
  "  - 需要查看批处理、补号维护、清理策略的含义",
  "",
  "## 四、顶部操作区说明",
  "",
  "### 刷新状态",
  "",
  "- 重新拉取后端配置、维护状态、批处理状态和输出目录状态。",
  "",
  "### 高级设置",
  "",
  "- 打开高级参数抽屉，适合调整运行保护、OAuth 策略、输出开关和登录页密码。",
  "",
  "### 安装向导",
  "",
  "- 适合首次部署或给别人演示。",
  "- 只负责引导，不会自动改你的配置。",
  "",
  "### 保存配置",
  "",
  "- 将当前界面中的配置写回后端配置文件。",
  "- 修改 CPA、邮箱、并发、策略等参数后，都建议先点一次保存。",
  "",
  "### 单次维护",
  "",
  "- 执行一轮完整维护流程。",
  "- 典型流程：",
  "  - 探测账号",
  "  - 清理无效账号",
  "  - 判断库存缺口",
  "  - 补充账号",
  "",
  "### 循环补号",
  "",
  "- 让系统持续巡检库存。",
  "- 适合日常挂机维持账号池。",
  "",
  "### 开始批处理",
  "",
  "- 按目标数量执行批量注册/输出链路。",
  "- 输出会同步到 `output_tokens` 下的标准目录。",
  "- 批量注册的产物统一只保存在本地目录，可下载 ZIP；不会自动推送到 CPA。",
  "- 如果开启 **批量注册允许仅 access_token 成功**，系统会在注册阶段拿到 access_token 后直接产出兼容增强版本地 JSON，用来绕过 OAuth 后续可能命中的手机号校验。",
  "- 这个模式的主要代价是：通常没有 refresh_token，所以不适合做额度刷新或长期续期管理。",
  "",
  "### 停止任务",
  "",
  "- 用于停止当前正在运行的维护任务或批处理任务。",
  "",
  "### 退出",
  "",
  "- 清除当前登录态，返回登录页。",
  "",
  "### 暗黑模式",
  "",
  "- 切换深浅色界面，不影响后端配置。",
  "",
  "## 五、首页功能区说明",
  "",
  "### 1. 实时运行监控",
  "",
  "- 显示：",
  "  - 当前阶段",
  "  - 本轮进度",
  "  - 成功 / 失败 / 待处理数量",
  "  - 最近单号耗时",
  "  - 实时日志",
  "",
  "### 2. 核心配置",
  "",
  "#### CPA 接口地址",
  "",
  "- 字段：`clean.base_url`",
  "- 作用：连接你的 CPA / CLI 管理接口。",
  "- 示例：",
  "",
  "```txt",
  "https://cli.example.com",
  "```",
  "",
  "#### CPA 访问令牌",
  "",
  "- 字段：`clean.token`",
  "- 作用：调用 CPA 接口时使用的访问凭证。",
  "",
  "#### 目标保有量",
  "",
  "- 字段：`maintainer.min_candidates`",
  "- 作用：账号池低于这个值时，系统会开始补号。",
  "",
  "#### 代理地址",
  "",
  "- 字段：`run.proxy`",
  "- 作用：注册或 OAuth 流程需要走代理时填写。",
  "",
  "## 六、邮箱配置详解",
  "",
  "> 这里是最关键的配置区之一。你选不同 Provider，需要填写的字段不同。",
  "",
  "### A. 自建 Mail API",
  "",
  "- Provider：`self_hosted_mail_api`",
  "- 适合：你自己部署了接码 / 邮件桥接服务，支持自定义域名邮箱。",
  "",
  "#### 需要填写的字段",
  "",
  "- `mailApiBase`",
  "  - 你的邮件桥接接口地址",
  "  - 示例：`https://mail-api.example.com/bridge`",
  "- `mailApiKey`",
  "  - 调用桥接接口所需的密钥",
  "- `mailDomain`",
  "  - 当前主域名",
  "  - 示例：`mail-example.com`",
  "- `mailDomains`",
  "  - 可轮换域名列表",
  "  - 一行一个",
  "- `mailUseRandomSubdomain`",
  "  - 是否启用随机子域名邮箱",
  "  - 开启后会生成类似 `ocxxxx@a1b2c3.mail-example.com` 的地址",
  "- `mailRandomSubdomainLength`",
  "  - 随机子域名前缀长度",
  "  - 推荐从 `6` 开始",
  "",
  "#### 自定义域名邮箱怎么填",
  "",
  "如果你已经把自定义域名接到了自己的邮件系统，推荐这样填：",
  "",
  "```md",
  "Provider: self_hosted_mail_api",
  "mailApiBase: https://mail-api.example.com/bridge",
  "mailApiKey: your-api-key",
  "mailDomain: mail-example.com",
  "mailDomains:",
  "mail-example.com",
  "mailUseRandomSubdomain: false",
  "mailRandomSubdomainLength: 6",
  "```",
  "",
  "如果你有多个可轮换域名，可以这样填：",
  "",
  "```md",
  "mailDomain: mail-example.com",
  "mailDomains:",
  "mail-example.com",
  "mx.mail-example.com",
  "signup-example.net",
  "mailUseRandomSubdomain: true",
  "mailRandomSubdomainLength: 6",
  "```",
  "",
  "#### 填写建议",
  "",
  "- `mailDomain`：填你当前最主要、最稳定的域名",
  "- `mailDomains`：填所有允许创建邮箱的域名列表",
  "- 如果只有一个域名：",
  "  - `mailDomain` 填这个域名",
  "  - `mailDomains` 也写这一行即可",
  "- 如果你准备走泛子域名邮箱：",
  "  - `mailDomain` 和 `mailDomains` 仍然填写根域名，不要写成 `*.example.com`",
  "  - 再打开 `mailUseRandomSubdomain` 即可",
  "- 自定义域名邮箱建议默认使用 `run.workers = 2`，通常是当前最稳的起步并发。",
  "",
  "### B. CF Mail",
  "",
  "- Provider：`cfmail`",
  "- 适合：你自己部署了 Cloudflare Worker 风格的邮箱接口。",
  "",
  "#### 需要填写的字段",
  "",
  "- `mailApiBase`",
  "  - 你的 CF Mail 接口地址",
  "- `mailApiKey`",
  "  - 接口密钥",
  "- `mailDomain`",
  "  - 主域名，可留空为列表第一项",
  "- `mailDomains`",
  "  - 域名列表，一行一个",
  "- `mailUseRandomSubdomain`",
  "  - 开启后会在根域名前自动拼随机二级域名",
  "- `mailRandomSubdomainLength`",
  "  - 随机子域名前缀长度，推荐 `6`",
  "",
  "#### 推荐示例",
  "",
  "```md",
  "Provider: cfmail",
  "mailApiBase: https://mail-worker.example.com",
  "mailApiKey: your-cfmail-key",
  "mailDomain: mydomain.com",
  "mailDomains:",
  "mydomain.com",
  "mail.mydomain.com",
  "mailUseRandomSubdomain: true",
  "mailRandomSubdomainLength: 6",
  "```",
  "",
  "#### 使用前提",
  "",
  "- Cloudflare 官方支持子域名邮件路由，但需要你先把对应根域名/子域接收链路配好。",
  "- 如果 CF Mail 后端只支持根域名、不支持子域收信，开启随机子域名后也收不到验证码。",
  "",
  "### C. DuckMail",
  "",
  "- Provider：`duckmail`",
  "- 适合：对接 DuckMail API。",
  "",
  "#### 需要填写的字段",
  "",
  "- `mailApiBase`",
  "  - 例如：`https://api.duckmail.sbs`",
  "- `mailApiKey`",
  "  - 实际对应 DuckMail 的 `bearer`",
  "- `mailDomain`",
  "  - 当前主要域名",
  "- `mailDomains`",
  "  - 备用域名列表",
  "- `mailUseRandomSubdomain`",
  "  - 开启后会创建 `用户名@随机前缀.根域名`",
  "- `mailRandomSubdomainLength`",
  "  - 随机子域名前缀长度，推荐 `6`",
  "",
  "#### 推荐示例",
  "",
  "```md",
  "Provider: duckmail",
  "mailApiBase: https://api.duckmail.sbs",
  "mailApiKey: your-bearer",
  "mailDomain: example.com",
  "mailDomains:",
  "example.com",
  "mailUseRandomSubdomain: true",
  "mailRandomSubdomainLength: 6",
  "```",
  "",
  "#### 使用前提",
  "",
  "- DuckMail 官方接口支持传完整 `address` 创建邮箱账号。",
  "- 想启用随机二级域名时，你填写的根域名必须已经在 DuckMail 侧验证并允许创建地址。",
  "",
  "### D. TempMail.lol",
  "",
  "- Provider：`tempmail_lol`",
  "- 适合：直接用公共接口快速跑通流程。",
  "",
  "#### 需要填写的字段",
  "",
  "- `mailApiBase`",
  "  - 一般为：`https://api.tempmail.lol/v2`",
  "",
  "#### 说明",
  "",
  "- 这个模式通常 **不需要自定义域名**",
  "- 也 **不需要 API Key**",
  "- 但公共接口可能会遇到：",
  "  - `429 Rate limited`",
  "  - `501 / 5xx`",
  "  - 域名不可控",
  "",
  "### E. 所有邮箱 Provider 通用参数",
  "",
  "#### 验证码超时（秒）",
  "",
  "- 字段：`mail.otp_timeout_seconds`",
  "- 含义：等待 OTP 的最长时长。",
  "",
  "#### 轮询间隔（秒）",
  "",
  "- 字段：`mail.poll_interval_seconds`",
  "- 含义：多久轮询一次验证码。",
  "",
  "## 七、补号策略",
  "",
  "### 补号并发数",
  "",
  "- 字段：`run.workers`",
  "- 并发越高，注册速度可能越快，但也更容易触发限流。",
  "- 如果使用自定义域名邮箱，建议先从 `2` 并发开始，稳定后再逐步上调。",
  "",
  "### 循环补号间隔",
  "",
  "- 字段：`maintainer.loop_interval_seconds`",
  "- 控制循环补号每轮检查间隔。",
  "",
  "### 验证码超时 / 邮件轮询间隔",
  "",
  "- 是邮箱链路的重要补充参数。",
  "",
  "## 八、清理策略",
  "",
  "### 目标账号类型",
  "",
  "- 字段：`clean.target_type`",
  "- 常见值：`codex`",
  "",
  "### 探测并发",
  "",
  "- 字段：`clean.workers`",
  "- 控制探测账号状态时的并发量。",
  "",
  "### 删除并发",
  "",
  "- 字段：`clean.delete_workers`",
  "- 控制执行删除动作时的并发量。",
  "",
  "### 用量阈值",
  "",
  "- 字段：`clean.used_percent_threshold`",
  "- 达到阈值后可能被标记为待清理或待处理。",
  "",
  "### 抽样数量",
  "",
  "- 字段：`clean.sample_size`",
  "- 为 `0` 时通常表示全量探测。",
  "",
  "## 九、批处理任务",
  "",
  "### 批处理目标数量",
  "",
  "- 用途：控制这次希望生成多少个成品账号。",
  "",
  "### 输出目录根路径",
  "",
  "- 默认目录：",
  "",
  "```txt",
  "C:\\path\\to\\your-project\\output_tokens",
  "```",
  "",
  "### 输出结构",
  "",
  "```txt",
  "output_tokens/",
  "  cpa/",
  "  subapi/",
  "```",
  "",
  "- `cpa/`：CPA 格式 JSON",
  "- `subapi/`：SubAPI 格式 JSON",
  "- 同一个账号会分别保存成两种格式，但统计时按同一账号去重",
  "",
  "## 十、高级设置",
  "",
  "### 运行保护",
  "",
  "- 连续失败阈值",
  "- 冷却时长",
  "- 最小 / 最大抖动秒数",
  "",
  "适合防止高频失败时持续硬冲。",
  "",
  "### 注册策略",
  "",
  "- 注册入口模式",
  "- 入口失败自动回退",
  "",
  "### OAuth 策略",
  "",
  "- 重试次数",
  "- 退避基数",
  "- 最大退避",
  "",
  "适合应对 `429`、网络波动、验证码延迟等情况。",
  "",
  "### 输出设置",
  "",
  "- **本地保存结果**：现在只对批量注册生效，不影响单次维护/循环补号。",
  "- **批量注册允许仅 access_token 成功**：这是推荐的“跳过手机号”功能。注册阶段只要拿到 access_token，就直接产出本地兼容增强版 JSON，速度更快、成功率更高。批量注册本身始终只落本地，不会自动推送到 CPA。",
  "- **循环补号允许仅 access_token 成功**：让维护模式也能在注册阶段拿到 access_token 后直接补到 CPA，适合你只想持续补可用号，不强求额度面板的场景。",
  "- 提醒：开启 access-only 后，系统会默认按兼容增强版 JSON 导出；其中批量注册始终只用于本地保存，维护模式可继续上传到 CPA。账号通常可以正常请求和统计成功/失败次数，但额度面板可能无法完整显示，这是该模式的已知边界。",
  "",
  "- 本地保存结果",
  "- 控制是否把结果直接写入本地文件",
  "",
  "### 访问安全",
  "",
  "- 可直接修改登录页密码",
  "- 修改后，后续登录应使用新密码",
  "",
  "## 十一、常见问题",
  "",
  "### 1. 为什么我能进入软件，但任务跑不起来？",
  "",
  "通常是下面几项没配完整：",
  "",
  "- CPA 地址或令牌没填",
  "- 邮箱 Provider 参数不完整",
  "- 自定义域名没有真正接入你的邮件系统",
  "",
  "### 2. 自定义域名邮箱最少要填什么？",
  "",
  "如果你用的是自建 Mail API，最少要填：",
  "",
  "```md",
  "mailApiBase",
  "mailApiKey",
  "mailDomain",
  "```",
  "",
  "如果要做域名轮换，再补：",
  "",
  "```md",
  "mailDomains",
  "```",
  "",
  "### 3. TempMail.lol 为什么报 429？",
  "",
  "- 因为公共接口存在免费限流",
  "- 并发高、请求频繁时更容易触发",
  "",
  "### 4. 为什么日志里会出现 OAuth 429？",
  "",
  "- 这通常不是邮箱创建失败",
  "- 而是 OpenAI / OAuth 相关链路在限流或退避重试",
  "",
  "## 十二、推荐的首套配置顺序",
  "",
  "```md",
  "1. 先配置 CPA 地址 + Token",
  "2. 再选择邮箱 Provider",
  "3. 如果是自建域名邮箱，先确认域名真的能收信",
  "4. 保存配置",
  "5. 先跑单次维护验证流程",
  "6. 稳定后再切循环补号或批处理",
  "```",
].join("\\n");

const providerOptions = [
  { label: "自建 Mail API", value: "self_hosted_mail_api" },
  { label: "CF Mail", value: "cfmail" },
  { label: "DuckMail", value: "duckmail" },
  { label: "TempMail.lol", value: "tempmail_lol" },
];

const providerStatusMap: Record<string, string> = {
  self_hosted_mail_api: "自建 Mail API",
  cfmail: "CF Mail",
  duckmail: "DuckMail",
  tempmail_lol: "TempMail.lol",
};

const phaseLabelMap: Record<string, string> = {
  idle: "空闲",
  looping: "循环补号",
  maintaining: "维护执行中",
  completed: "最近一次维护完成",
  failed: "最近一次维护失败",
  running: "批处理执行中",
  stopped: "批处理已停止",
};

const initialValues = {
  cpaBaseUrl: defaultBackendConfig.clean.base_url,
  cpaToken: defaultBackendConfig.clean.token,
  minCandidates: defaultBackendConfig.maintainer.min_candidates,
  proxy: defaultBackendConfig.run.proxy,
  provider: defaultBackendConfig.mail.provider,
  mailApiBase: defaultBackendConfig.mail.api_base,
  mailApiKey: defaultBackendConfig.mail.api_key,
  mailDomain: defaultBackendConfig.mail.domain,
  mailDomains: defaultBackendConfig.mail.domains.join("\n"),
  mailMixDomainRotation: defaultBackendConfig.mail.mix_domain_rotation,
  mailUseRandomSubdomain: defaultBackendConfig.mail.use_random_subdomain,
  mailRandomSubdomainLength: defaultBackendConfig.mail.random_subdomain_length,
  otpTimeoutSeconds: defaultBackendConfig.mail.otp_timeout_seconds,
  pollIntervalSeconds: defaultBackendConfig.mail.poll_interval_seconds,
  runWorkers: defaultBackendConfig.run.workers,
  loopIntervalSeconds: defaultBackendConfig.maintainer.loop_interval_seconds,
  cleanTargetType: defaultBackendConfig.clean.target_type,
  cleanWorkers: defaultBackendConfig.clean.workers,
  deleteWorkers: defaultBackendConfig.clean.delete_workers,
  usedPercentThreshold: defaultBackendConfig.clean.used_percent_threshold,
  sampleSize: defaultBackendConfig.clean.sample_size,
  failureThreshold: defaultBackendConfig.run.failure_threshold_for_cooldown,
  cooldownSeconds: defaultBackendConfig.run.failure_cooldown_seconds,
  loopJitterMinSeconds: defaultBackendConfig.run.loop_jitter_min_seconds,
  loopJitterMaxSeconds: defaultBackendConfig.run.loop_jitter_max_seconds,
  entryMode: defaultBackendConfig.registration.entry_mode,
  entryModeFallback: defaultBackendConfig.registration.entry_mode_fallback,
  oauthRetryAttempts: defaultBackendConfig.oauth.retry_attempts,
  oauthRetryBackoffBase: defaultBackendConfig.oauth.retry_backoff_base,
  oauthRetryBackoffMax: defaultBackendConfig.oauth.retry_backoff_max,
  saveLocal: defaultBackendConfig.output.save_local,
  batchAllowAccessTokenOnly: defaultBackendConfig.output.batch_allow_access_token_only,
  maintainerAllowAccessTokenOnly: defaultBackendConfig.output.maintainer_allow_access_token_only,
};
const BATCH_TARGET_STORAGE_KEY = "apm_batch_target_count";

function normalizeDomainText(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeDomainList(value: unknown): string[] {
  return Array.from(new Set(linesToArray(value).map((item) => normalizeDomainText(item)).filter(Boolean)));
}

function getStoredBatchTarget(): number {
  const rawValue = window.localStorage.getItem(BATCH_TARGET_STORAGE_KEY) ?? "20";
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 20;
  }
  return Math.max(1, Math.floor(parsed));
}

function configToFormValues(config: BackendConfig) {
  return {
    cpaBaseUrl: config.clean.base_url,
    cpaToken: config.clean.token,
    minCandidates: config.maintainer.min_candidates,
    proxy: config.run.proxy,
    provider: config.mail.provider,
    mailApiBase:
      config.mail.provider === "cfmail"
        ? config.cfmail.api_base
        : config.mail.provider === "duckmail"
          ? config.duckmail.api_base
          : config.mail.provider === "tempmail_lol"
            ? config.tempmail_lol.api_base
            : config.mail.api_base,
    mailApiKey:
      config.mail.provider === "cfmail"
        ? config.cfmail.api_key
        : config.mail.provider === "duckmail"
          ? config.duckmail.bearer
          : config.mail.api_key,
    mailDomain:
      config.mail.provider === "cfmail"
        ? config.cfmail.domain
        : config.mail.provider === "duckmail"
          ? config.duckmail.domain
          : config.mail.domain,
  mailDomains:
      config.mail.provider === "cfmail"
        ? config.cfmail.domains.join("\n")
        : config.mail.provider === "duckmail"
          ? config.duckmail.domains.join("\n")
          : config.mail.domains.join("\n"),
    mailMixDomainRotation: config.mail.provider === "self_hosted_mail_api" ? config.mail.mix_domain_rotation : false,
    mailUseRandomSubdomain:
      config.mail.provider === "cfmail"
        ? config.cfmail.use_random_subdomain
        : config.mail.provider === "duckmail"
          ? config.duckmail.use_random_subdomain
          : config.mail.provider === "self_hosted_mail_api"
            ? config.mail.use_random_subdomain
            : false,
    mailRandomSubdomainLength:
      config.mail.provider === "cfmail"
        ? config.cfmail.random_subdomain_length
        : config.mail.provider === "duckmail"
          ? config.duckmail.random_subdomain_length
          : config.mail.provider === "self_hosted_mail_api"
            ? config.mail.random_subdomain_length
            : 6,
    otpTimeoutSeconds: config.mail.otp_timeout_seconds,
    pollIntervalSeconds: config.mail.poll_interval_seconds,
    runWorkers: config.run.workers,
    loopIntervalSeconds: config.maintainer.loop_interval_seconds,
    cleanTargetType: config.clean.target_type,
    cleanWorkers: config.clean.workers,
    deleteWorkers: config.clean.delete_workers,
    usedPercentThreshold: config.clean.used_percent_threshold,
    sampleSize: config.clean.sample_size,
    failureThreshold: config.run.failure_threshold_for_cooldown,
    cooldownSeconds: config.run.failure_cooldown_seconds,
    loopJitterMinSeconds: config.run.loop_jitter_min_seconds,
    loopJitterMaxSeconds: config.run.loop_jitter_max_seconds,
    entryMode: config.registration.entry_mode,
    entryModeFallback: config.registration.entry_mode_fallback,
    oauthRetryAttempts: config.oauth.retry_attempts,
    oauthRetryBackoffBase: config.oauth.retry_backoff_base,
    oauthRetryBackoffMax: config.oauth.retry_backoff_max,
    saveLocal: config.output.save_local,
    batchAllowAccessTokenOnly: config.output.batch_allow_access_token_only,
    maintainerAllowAccessTokenOnly: config.output.maintainer_allow_access_token_only,
  };
}

function getProviderFormSnapshot(config: BackendConfig, provider: string): ProviderSnapshotFields {
  if (provider === "cfmail") {
    return {
      mailApiBase: config.cfmail.api_base,
      mailApiKey: config.cfmail.api_key,
      mailDomain: config.cfmail.domain,
      mailDomains: config.cfmail.domains.join("\n"),
      mailMixDomainRotation: false,
      mailUseRandomSubdomain: config.cfmail.use_random_subdomain,
      mailRandomSubdomainLength: config.cfmail.random_subdomain_length,
    };
  }
  if (provider === "duckmail") {
    return {
      mailApiBase: config.duckmail.api_base,
      mailApiKey: config.duckmail.bearer,
      mailDomain: config.duckmail.domain,
      mailDomains: config.duckmail.domains.join("\n"),
      mailMixDomainRotation: false,
      mailUseRandomSubdomain: config.duckmail.use_random_subdomain,
      mailRandomSubdomainLength: config.duckmail.random_subdomain_length,
    };
  }
  if (provider === "tempmail_lol") {
    return {
      mailApiBase: config.tempmail_lol.api_base || defaultBackendConfig.tempmail_lol.api_base,
      mailApiKey: "",
      mailDomain: "",
      mailDomains: "",
      mailMixDomainRotation: false,
      mailUseRandomSubdomain: false,
      mailRandomSubdomainLength: 6,
    };
  }
  return {
    mailApiBase: config.mail.api_base,
    mailApiKey: config.mail.api_key,
    mailDomain: config.mail.domain,
    mailDomains: config.mail.domains.join("\n"),
    mailMixDomainRotation: config.mail.mix_domain_rotation,
    mailUseRandomSubdomain: config.mail.use_random_subdomain,
    mailRandomSubdomainLength: config.mail.random_subdomain_length,
  };
}

function buildProviderDrafts(config: BackendConfig): Record<string, ProviderSnapshotFields> {
  return {
    self_hosted_mail_api: getProviderFormSnapshot(config, "self_hosted_mail_api"),
    cfmail: getProviderFormSnapshot(config, "cfmail"),
    duckmail: getProviderFormSnapshot(config, "duckmail"),
    tempmail_lol: getProviderFormSnapshot(config, "tempmail_lol"),
  };
}

function linesToArray(value: unknown): string[] {
  return String(value ?? "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function formValuesToConfig(values: typeof initialValues, currentConfig: BackendConfig): BackendConfig {
  const next = normalizeBackendConfig(structuredClone(currentConfig));
  next.clean.base_url = values.cpaBaseUrl;
  next.clean.token = values.cpaToken;
  next.clean.target_type = values.cleanTargetType;
  next.clean.workers = Number(values.cleanWorkers);
  next.clean.delete_workers = Number(values.deleteWorkers);
  next.clean.used_percent_threshold = Number(values.usedPercentThreshold);
  next.clean.sample_size = Number(values.sampleSize);
  next.maintainer.min_candidates = Number(values.minCandidates);
  next.maintainer.loop_interval_seconds = Number(values.loopIntervalSeconds);
  next.run.proxy = values.proxy;
  next.run.workers = Number(values.runWorkers);
  next.run.failure_threshold_for_cooldown = Number(values.failureThreshold);
  next.run.failure_cooldown_seconds = Number(values.cooldownSeconds);
  next.run.loop_jitter_min_seconds = Number(values.loopJitterMinSeconds);
  next.run.loop_jitter_max_seconds = Number(values.loopJitterMaxSeconds);
  next.mail.provider = values.provider;
  next.mail.otp_timeout_seconds = Number(values.otpTimeoutSeconds);
  next.mail.poll_interval_seconds = Number(values.pollIntervalSeconds);
  next.registration.entry_mode = values.entryMode;
  next.registration.entry_mode_fallback = Boolean(values.entryModeFallback);
  next.oauth.retry_attempts = Number(values.oauthRetryAttempts);
  next.oauth.retry_backoff_base = Number(values.oauthRetryBackoffBase);
  next.oauth.retry_backoff_max = Number(values.oauthRetryBackoffMax);
  next.output.save_local = true;
  next.output.batch_allow_access_token_only = Boolean(values.batchAllowAccessTokenOnly);
  next.output.maintainer_allow_access_token_only = Boolean(values.maintainerAllowAccessTokenOnly);

  if (values.provider === "cfmail") {
    next.cfmail.api_base = values.mailApiBase;
    next.cfmail.api_key = values.mailApiKey;
    next.cfmail.domain = values.mailDomain;
    next.cfmail.domains = linesToArray(values.mailDomains);
    next.cfmail.use_random_subdomain = Boolean(values.mailUseRandomSubdomain);
    next.cfmail.random_subdomain_length = Number(values.mailRandomSubdomainLength);
  } else if (values.provider === "duckmail") {
    next.duckmail.api_base = values.mailApiBase;
    next.duckmail.bearer = values.mailApiKey;
    next.duckmail.domain = values.mailDomain;
    next.duckmail.domains = linesToArray(values.mailDomains);
    next.duckmail.use_random_subdomain = Boolean(values.mailUseRandomSubdomain);
    next.duckmail.random_subdomain_length = Number(values.mailRandomSubdomainLength);
  } else if (values.provider === "tempmail_lol") {
    next.tempmail_lol.api_base = values.mailApiBase;
  } else {
    next.mail.api_base = values.mailApiBase;
    next.mail.api_key = values.mailApiKey;
    next.mail.domain = values.mailDomain;
    next.mail.domains = linesToArray(values.mailDomains);
    next.mail.mix_domain_rotation = Boolean(values.mailMixDomainRotation);
    next.mail.use_random_subdomain = Boolean(values.mailUseRandomSubdomain);
    next.mail.random_subdomain_length = Number(values.mailRandomSubdomainLength);
  }

  return next;
}

function formatSeconds(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return "--";
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)}s`;
}

function formatLoopNextCheck(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) {
    return "等待下一次状态刷新";
  }
  return `${Math.max(0, Math.round(seconds))}s 后复检`;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return "--";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("zh-CN", { hour12: false });
}

function formatFileSize(bytes: number | null | undefined): string {
  const size = Number(bytes ?? 0);
  if (!Number.isFinite(size) || size <= 0) {
    return "0 B";
  }
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function toneToTagColor(tone: LogLine["tone"]): "success" | "warning" | "error" | "processing" | "default" {
  if (tone === "success") {
    return "success";
  }
  if (tone === "warning") {
    return "warning";
  }
  if (tone === "danger") {
    return "error";
  }
  if (tone === "info") {
    return "processing";
  }
  return "default";
}

function toneToTimelineColor(tone: LogLine["tone"]): string {
  if (tone === "success") {
    return "green";
  }
  if (tone === "warning") {
    return "orange";
  }
  if (tone === "danger") {
    return "red";
  }
  if (tone === "info") {
    return "blue";
  }
  return "gray";
}

function batchPhaseTagColor(phase: string | undefined, running: boolean | undefined): "success" | "processing" | "error" | "default" | "warning" {
  if (running) {
    return "processing";
  }
  if (phase === "completed") {
    return "success";
  }
  if (phase === "failed") {
    return "error";
  }
  if (phase === "stopped") {
    return "warning";
  }
  return "default";
}

function getProviderSnapshot(config: BackendConfig, provider: string) {
  if (provider === "cfmail") {
    return {
      apiBase: config.cfmail.api_base,
      domain: config.cfmail.domain,
      domains: config.cfmail.domains,
    };
  }
  if (provider === "duckmail") {
    return {
      apiBase: config.duckmail.api_base,
      domain: config.duckmail.domain,
      domains: config.duckmail.domains,
    };
  }
  if (provider === "tempmail_lol") {
    return {
      apiBase: config.tempmail_lol.api_base,
      domain: "",
      domains: [],
    };
  }
  return {
    apiBase: config.mail.api_base,
    domain: config.mail.domain,
    domains: config.mail.domains,
  };
}

type SetupGuideItem = {
  key: string;
  title: string;
  description: string;
};

function hasPlaceholder(value: string, placeholders: string[]): boolean {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    return true;
  }
  return placeholders.some((item) => normalized === item.trim().toLowerCase());
}

function hasExampleDomain(value: string): boolean {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized.includes("example.com") || normalized.includes("mail.example.com");
}

function getSetupGuideItems(config: BackendConfig): SetupGuideItem[] {
  const items: SetupGuideItem[] = [];
  const provider = String(config.mail.provider || "").trim();

  if (hasPlaceholder(config.clean.base_url, ["CPA地址"])) {
    items.push({
      key: "cpa_base_url",
      title: "先配置 CPA 接口地址",
      description: "请在“核心配置”里填写可访问的 CPA Base URL，否则账号清理、库存读取和维护任务都无法正常工作。",
    });
  }

  if (hasPlaceholder(config.clean.token, ["CPA登录密码"])) {
    items.push({
      key: "cpa_token",
      title: "补上 CPA 访问令牌",
      description: "请在“核心配置”里填写 CPA Token。只有填好后，系统才能读取账号池并执行维护动作。",
    });
  }

  if (!provider) {
    items.push({
      key: "mail_provider",
      title: "选择邮箱提供方",
      description: "请先在“邮箱配置”里选择可用的邮箱或接码 Provider。",
    });
    return items;
  }

  if (provider === "self_hosted_mail_api") {
    if (hasPlaceholder(config.mail.api_base, ["https://your-worker.workers.dev"]) || hasExampleDomain(config.mail.api_base)) {
      items.push({
        key: "mail_api_base",
        title: "配置自建 Mail API 地址",
        description: "请填写你自己的 mail-bridge 地址，不能继续使用示例占位地址。",
      });
    }
    if (hasPlaceholder(config.mail.api_key, ["your-mail-api-key"])) {
      items.push({
        key: "mail_api_key",
        title: "配置自建 Mail API 密钥",
        description: "请填写可用的 API Key，否则无法创建邮箱和轮询验证码。",
      });
    }
    if (!String(config.mail.domain || "").trim() || hasExampleDomain(config.mail.domain)) {
      items.push({
        key: "mail_domain",
        title: "配置邮箱域名",
        description: "请填写你的真实邮箱域名，后续注册和 OTP 收取都会依赖它。",
      });
    }
  }

  if (provider === "cfmail") {
    if (hasExampleDomain(config.cfmail.api_base)) {
      items.push({
        key: "cfmail_api_base",
        title: "配置 CF Mail 接口地址",
        description: "当前还是示例地址，请替换为你实际部署的 CF Mail 接口。",
      });
    }
    if (!String(config.cfmail.api_key || "").trim()) {
      items.push({
        key: "cfmail_api_key",
        title: "补上 CF Mail 密钥",
        description: "请填写 CF Mail 的管理密钥，否则接口无法调用。",
      });
    }
    if (config.cfmail.domains.length === 0) {
      items.push({
        key: "cfmail_domains",
        title: "补上 CF Mail 域名列表",
        description: "请至少填写一个 CF Mail 域名，否则无法创建邮箱。",
      });
    }
  }

  if (provider === "duckmail" && !String(config.duckmail.bearer || "").trim()) {
    items.push({
      key: "duckmail_bearer",
      title: "补上 DuckMail Bearer",
      description: "DuckMail 模式下至少需要 Bearer 才能继续创建邮箱。",
    });
  }

  return items;
}

function LoginBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const particleColor = "rgba(22, 119, 255, 0.22)";
    const particles: Array<{
      x: number;
      y: number;
      baseX: number;
      baseY: number;
      size: number;
      density: number;
      alpha: number;
    }> = [];
    const pointer = {
      x: -9999,
      y: -9999,
      radius: 140,
    };

    let animationFrameId = 0;

    const setCanvasSize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const createParticles = () => {
      particles.length = 0;
      const count = reduceMotion ? 0 : Math.max(36, Math.floor((window.innerWidth * window.innerHeight) / 18000));
      for (let index = 0; index < count; index += 1) {
        const x = Math.random() * window.innerWidth;
        const y = Math.random() * window.innerHeight;
        particles.push({
          x,
          y,
          baseX: x,
          baseY: y,
          size: Math.random() * 1.8 + 0.6,
          density: Math.random() * 18 + 6,
          alpha: Math.random() * 0.24 + 0.08,
        });
      }
    };

    const draw = () => {
      context.clearRect(0, 0, window.innerWidth, window.innerHeight);
      for (const particle of particles) {
        const dx = pointer.x - particle.x;
        const dy = pointer.y - particle.y;
        const distance = Math.hypot(dx, dy) || 1;
        if (distance < pointer.radius) {
          const force = (pointer.radius - distance) / pointer.radius;
          particle.x -= (dx / distance) * force * (particle.density * 0.18);
          particle.y -= (dy / distance) * force * (particle.density * 0.18);
        } else {
          particle.x += (particle.baseX - particle.x) * 0.04;
          particle.y += (particle.baseY - particle.y) * 0.04;
        }

        context.fillStyle = particleColor.replace("0.22", particle.alpha.toFixed(3));
        context.beginPath();
        context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        context.fill();
      }
      animationFrameId = window.requestAnimationFrame(draw);
    };

    const handleResize = () => {
      setCanvasSize();
      createParticles();
    };

    const handlePointerMove = (event: MouseEvent) => {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
    };

    const handlePointerLeave = () => {
      pointer.x = -9999;
      pointer.y = -9999;
    };

    handleResize();
    if (!reduceMotion) {
      draw();
      window.addEventListener("mousemove", handlePointerMove);
      window.addEventListener("mouseleave", handlePointerLeave);
    }
    window.addEventListener("resize", handleResize);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("mousemove", handlePointerMove);
      window.removeEventListener("mouseleave", handlePointerLeave);
    };
  }, []);

  return (
    <>
      <div className="login-grid-bg" aria-hidden="true" />
      <div className="login-grid-glow" aria-hidden="true" />
      <canvas ref={canvasRef} className="login-particle-canvas" aria-hidden="true" />
    </>
  );
}

const GUIDE_TEMPLATE_MAP = {
  self_hosted: `{
  "run": {
    "workers": 2
  },
  "mail": {
    "provider": "self_hosted_mail_api",
    "api_base": "https://mail-api.example.com/bridge",
    "api_key": "your-api-key",
    "domain": "mail-example.com",
    "domains": ["mail-example.com"],
    "use_random_subdomain": true,
    "random_subdomain_length": 6,
    "otp_timeout_seconds": 120,
    "poll_interval_seconds": 3
  }
}`,
  cfmail: `{
  "mail": {
    "provider": "cfmail",
    "otp_timeout_seconds": 120,
    "poll_interval_seconds": 3
  },
  "cfmail": {
    "api_base": "https://mail-worker.example.com",
    "api_key": "your-cfmail-key",
    "domain": "mydomain.com",
    "domains": ["mydomain.com", "mail.mydomain.com"],
    "use_random_subdomain": true,
    "random_subdomain_length": 6
  }
}`,
  duckmail: `{
  "mail": {
    "provider": "duckmail",
    "otp_timeout_seconds": 120,
    "poll_interval_seconds": 3
  },
  "duckmail": {
    "api_base": "https://api.duckmail.sbs",
    "bearer": "your-bearer",
    "domain": "example.com",
    "domains": ["example.com"],
    "use_random_subdomain": true,
    "random_subdomain_length": 6
  }
}`,
  tempmail: `{
  "mail": {
    "provider": "tempmail_lol",
    "otp_timeout_seconds": 120,
    "poll_interval_seconds": 3
  },
  "tempmail_lol": {
    "api_base": "https://api.tempmail.lol/v2"
  }
}`,
} as const;

const GUIDE_SECTIONS = [
  { id: "quick-start", label: "快速开始" },
  { id: "features", label: "功能总览" },
  { id: "cpa-config", label: "CPA 配置" },
  { id: "mail-config", label: "邮箱配置" },
  { id: "templates", label: "推荐模板" },
  { id: "errors", label: "错误码解释" },
  { id: "batch-output", label: "批处理与输出" },
  { id: "advanced", label: "高级设置" },
] as const;

function UserGuideReadView() {
  const [activeSection, setActiveSection] = useState<(typeof GUIDE_SECTIONS)[number]["id"]>("quick-start");
  const [copiedTemplate, setCopiedTemplate] = useState("");
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const contentRef = useRef<HTMLDivElement | null>(null);

  const handleCopyTemplate = async (key: keyof typeof GUIDE_TEMPLATE_MAP) => {
    try {
      await navigator.clipboard.writeText(GUIDE_TEMPLATE_MAP[key]);
      setCopiedTemplate(key);
      window.setTimeout(() => {
        setCopiedTemplate((current) => (current === key ? "" : current));
      }, 1600);
    } catch {
      setCopiedTemplate("");
    }
  };

  const handleJumpToSection = (id: (typeof GUIDE_SECTIONS)[number]["id"]) => {
    setActiveSection(id);
    sectionRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const registerSectionRef =
    (id: (typeof GUIDE_SECTIONS)[number]["id"]) =>
    (node: HTMLDivElement | null) => {
      sectionRefs.current[id] = node;
    };

  useEffect(() => {
    const container = contentRef.current;
    if (!container) {
      return;
    }

    const handleScroll = () => {
      const containerTop = container.getBoundingClientRect().top + 80;
      let nextActive = activeSection;
      for (const section of GUIDE_SECTIONS) {
        const node = sectionRefs.current[section.id];
        if (!node) {
          continue;
        }
        const rect = node.getBoundingClientRect();
        if (rect.top <= containerTop) {
          nextActive = section.id;
        }
      }
      if (nextActive !== activeSection) {
        setActiveSection(nextActive);
      }
    };

    handleScroll();
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [activeSection]);

  return (
    <div className="guide-layout">
      <aside className="guide-sidebar">
        <div className="guide-sidebar-head">
          <Text strong>文档目录</Text>
          <Text type="secondary">从左侧快速跳转到对应章节</Text>
        </div>
        <div className="guide-sidebar-nav">
          {GUIDE_SECTIONS.map((section, index) => (
            <button
              key={section.id}
              type="button"
              className={`guide-nav-item${activeSection === section.id ? " active" : ""}`}
              onClick={() => handleJumpToSection(section.id)}
            >
              <span className="guide-nav-index">{index + 1}</span>
              <span className="guide-nav-label">{section.label}</span>
            </button>
          ))}
        </div>
      </aside>

      <div ref={contentRef} className="guide-content">
        <div ref={registerSectionRef("quick-start")} className="guide-section-card">
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            <div>
              <Title level={4} style={{ marginBottom: 8 }}>
                快速开始
              </Title>
              <Text type="secondary">建议首次使用时先按这个顺序走一遍，避免任务启动后才发现基础参数缺失。</Text>
            </div>
            <Alert
              showIcon
              type="info"
              message="建议阅读顺序"
              description="先配置 CPA，再配置邮箱，保存后先用单次维护验证链路，稳定后再切循环补号或批处理。"
            />
            <List
              size="small"
              dataSource={[
                "登录控制台并确认管理令牌可用",
                "先填写 CPA 地址和访问令牌",
                "选择邮箱 Provider，并补齐对应参数",
                "点击保存配置",
                "先用单次维护验证流程，稳定后再切循环补号或批处理",
              ]}
              renderItem={(item, index) => (
                <List.Item>
                  <Text>
                    {index + 1}. {item}
                  </Text>
                </List.Item>
              )}
            />
          </Space>
        </div>

        <div ref={registerSectionRef("features")} className="guide-section-card">
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            <div>
              <Title level={4} style={{ marginBottom: 8 }}>
                功能总览
              </Title>
              <Text type="secondary">登录页、顶部操作区和首页各功能块都在这里统一说明。</Text>
            </div>
            <Card size="small" title="登录页">
              <List
                size="small"
                dataSource={[
                  "管理登录：输入 X-Admin-Token 进入控制台",
                  "使用说明：打开这份帮助文档",
                  "背景和特效只影响视觉，不影响配置和登录逻辑",
                ]}
                renderItem={(item) => (
                  <List.Item>
                    <Text>{item}</Text>
                  </List.Item>
                )}
              />
            </Card>
            <Card size="small" title="顶部操作区">
              <div className="guide-inline-tags">
                <Tag>刷新状态</Tag>
                <Tag>高级设置</Tag>
                <Tag>安装向导</Tag>
                <Tag>保存配置</Tag>
                <Tag>单次维护</Tag>
                <Tag>循环补号</Tag>
                <Tag>开始批处理</Tag>
                <Tag>停止任务</Tag>
                <Tag>退出</Tag>
              </div>
              <Text type="secondary">分别对应状态同步、参数配置、初始化引导、配置写回、维护任务与批处理任务控制。</Text>
            </Card>
            <Card size="small" title="首页主要区域">
              <div className="guide-inline-tags">
                <Tag color="blue">实时运行监控</Tag>
                <Tag color="blue">核心配置</Tag>
                <Tag color="blue">邮箱配置</Tag>
                <Tag color="blue">补号策略</Tag>
                <Tag color="blue">清理策略</Tag>
                <Tag color="blue">批处理任务</Tag>
                <Tag color="blue">输出目录状态</Tag>
              </div>
            </Card>
          </Space>
        </div>

        <div ref={registerSectionRef("cpa-config")} className="guide-section-card">
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            <div>
              <Title level={4} style={{ marginBottom: 8 }}>
                CPA 配置
              </Title>
              <Text type="secondary">这一块决定你能不能读取账号池、判断库存缺口、执行清理和维护动作。</Text>
            </div>
            <List
              size="small"
              dataSource={[
                {
                  title: "CPA 接口地址",
                  value: "字段为 clean.base_url。建议填你的真实控制接口地址，例如 https://cli.example.com。",
                },
                {
                  title: "CPA 访问令牌",
                  value: "字段为 clean.token。没有这个令牌，系统无法访问 CPA 后端。",
                },
                {
                  title: "目标保有量",
                  value: "字段为 maintainer.min_candidates。库存低于这个值时，系统会开始补号。",
                },
                {
                  title: "代理地址",
                  value: "字段为 run.proxy。注册或 OAuth 需要走代理时再填，不需要时可留空。",
                },
              ]}
              renderItem={(item) => (
                <List.Item>
                  <Space direction="vertical" size={2}>
                    <Text strong>{item.title}</Text>
                    <Text type="secondary">{item.value}</Text>
                  </Space>
                </List.Item>
              )}
            />
          </Space>
        </div>

        <div ref={registerSectionRef("mail-config")} className="guide-section-card">
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            <div>
              <Title level={4} style={{ marginBottom: 8 }}>
                邮箱配置
              </Title>
              <Text type="secondary">不同 Provider 需要的字段不一样，自定义域名邮箱建议优先使用自建 Mail API，并默认从 2 并发开始。</Text>
            </div>
            <Card size="small" title="自定义域名邮箱怎么填">
              <Space direction="vertical" size={10} style={{ width: "100%" }}>
                <Text>
                  如果你使用的是自建邮件接口或桥接服务，请选择 <Text code>self_hosted_mail_api</Text>，然后按下面方式填写。
                </Text>
                <pre className="guide-code-block">{`Provider: self_hosted_mail_api
mailApiBase: https://mail-api.example.com/bridge
mailApiKey: your-api-key
mailDomain: mail-example.com
mailDomains:
mail-example.com
mailUseRandomSubdomain: true
mailRandomSubdomainLength: 6`}</pre>
                <Text type="secondary">
                  `mailDomain` 和 `mailDomains` 仍然填写根域名；如果你服务器已经支持泛子域名收信，再打开 `mailUseRandomSubdomain`。
                  自定义域名邮箱建议默认用 2 并发最稳。
                </Text>
              </Space>
            </Card>
            <Card size="small" title="各 Provider 所需参数">
              <List
                size="small"
                dataSource={[
                  {
                    title: "self_hosted_mail_api",
                    value: "需要填写 mailApiBase、mailApiKey、mailDomain、mailDomains；如果服务器已开泛域名，还可选填 mailUseRandomSubdomain 和 mailRandomSubdomainLength。",
                  },
                  {
                    title: "CF Mail",
                    value: "需要填写 mailApiBase、mailApiKey、mailDomain、mailDomains；如果后端已支持子域收信，还可开启 mailUseRandomSubdomain。",
                  },
                  {
                    title: "DuckMail",
                    value: "需要填写 mailApiBase、mailApiKey(实际为 bearer)、mailDomain、mailDomains；若根域名已在 DuckMail 验证，可开启 mailUseRandomSubdomain。",
                  },
                  {
                    title: "TempMail.lol",
                    value: "通常只需要填写 mailApiBase，不支持自定义域名，也不需要单独 API Key。",
                  },
                ]}
                renderItem={(item) => (
                  <List.Item>
                    <Space direction="vertical" size={2}>
                      <Text strong>{item.title}</Text>
                      <Text type="secondary">{item.value}</Text>
                    </Space>
                  </List.Item>
                )}
              />
            </Card>
          </Space>
        </div>

        <div ref={registerSectionRef("templates")} className="guide-section-card">
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            <div>
              <Title level={4} style={{ marginBottom: 8 }}>
                推荐配置模板
              </Title>
              <Text type="secondary">下面这些模板适合直接复制出去改值。按钮只复制模板文本，不会改你当前页面里的配置。</Text>
            </div>

            <Card
              size="small"
              title="自建域名邮箱模板"
              extra={
                <Button size="small" icon={<CopyOutlined />} onClick={() => handleCopyTemplate("self_hosted")}>
                  {copiedTemplate === "self_hosted" ? "已复制" : "复制模板"}
                </Button>
              }
            >
              <pre className="guide-code-block">{GUIDE_TEMPLATE_MAP.self_hosted}</pre>
            </Card>

            <Card
              size="small"
              title="CF Mail 模板"
              extra={
                <Button size="small" icon={<CopyOutlined />} onClick={() => handleCopyTemplate("cfmail")}>
                  {copiedTemplate === "cfmail" ? "已复制" : "复制模板"}
                </Button>
              }
            >
              <pre className="guide-code-block">{GUIDE_TEMPLATE_MAP.cfmail}</pre>
            </Card>

            <Card
              size="small"
              title="DuckMail 模板"
              extra={
                <Button size="small" icon={<CopyOutlined />} onClick={() => handleCopyTemplate("duckmail")}>
                  {copiedTemplate === "duckmail" ? "已复制" : "复制模板"}
                </Button>
              }
            >
              <pre className="guide-code-block">{GUIDE_TEMPLATE_MAP.duckmail}</pre>
            </Card>

            <Card
              size="small"
              title="TempMail.lol 模板"
              extra={
                <Button size="small" icon={<CopyOutlined />} onClick={() => handleCopyTemplate("tempmail")}>
                  {copiedTemplate === "tempmail" ? "已复制" : "复制模板"}
                </Button>
              }
            >
              <pre className="guide-code-block">{GUIDE_TEMPLATE_MAP.tempmail}</pre>
            </Card>
          </Space>
        </div>

        <div ref={registerSectionRef("errors")} className="guide-section-card">
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            <div>
              <Title level={4} style={{ marginBottom: 8 }}>
                错误码解释
              </Title>
              <Text type="secondary">这里整理的是你在日志里最容易碰到、也是最值得先判断归因的几类错误。</Text>
            </div>
            <List
              size="small"
              dataSource={[
                {
                  code: "HTTP 400 / user_register_http_400",
                  meaning: "注册请求被目标端拒绝，常见为请求参数、风控环境或临时注册策略变化。",
                  action: "优先看步骤2诊断摘要；确认邮箱格式、代理环境、入口模式是否正常。",
                },
                {
                  code: "HTTP 401",
                  meaning: "接口鉴权失败，常见于 CPA Token、管理令牌或目标接口令牌失效。",
                  action: "检查 clean.token、登录页密码和后端环境变量是否一致。",
                },
                {
                  code: "HTTP 429",
                  meaning: "命中限流，可能来自 TempMail.lol、OAuth 链路或目标平台注册接口。",
                  action: "降低并发、增加退避、改用自建 Mail API，必要时切换代理或域名。",
                },
                {
                  code: "HTTP 501 / 5xx",
                  meaning: "上游接口不可用或请求方式不被支持，常见于公共邮箱接口或桥接服务异常。",
                  action: "优先确认 api_base 是否写对，再检查上游服务是否真的在线。",
                },
                {
                  code: "oauth_attempt_3_failed",
                  meaning: "OAuth 三次重试仍然失败，通常前面已经出现 429、验证码超时或手机验证分支。",
                  action: "查看同一邮箱前面的 OAuth 日志，判断是限流、验证码延迟还是风控触发；如果明显卡在手机验证，优先去高级设置开启 access-only 跳过手机号。",
                },
                {
                  code: "add_phone / phone_verification",
                  meaning: "注册或 OAuth 后半段命中了手机验证分支，当前账号继续走完整流程的成功率会很差。",
                  action: "如果你的目标是先产出可用号，直接去高级设置开启“允许仅 access_token 成功”，让系统在拿到 access_token 后提前收口。",
                },
                {
                  code: "create_mailbox_failed",
                  meaning: "创建邮箱阶段失败，往往是 Provider 参数不完整、接口不可达或域名不可用。",
                  action: "检查 mailApiBase、mailApiKey、mailDomain、mailDomains 是否正确。",
                },
              ]}
              renderItem={(item) => (
                <List.Item>
                  <Space direction="vertical" size={4} style={{ width: "100%" }}>
                    <Text strong>{item.code}</Text>
                    <Text type="secondary">含义：{item.meaning}</Text>
                    <Text type="secondary">建议：{item.action}</Text>
                  </Space>
                </List.Item>
              )}
            />
          </Space>
        </div>

        <div ref={registerSectionRef("batch-output")} className="guide-section-card">
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            <div>
              <Title level={4} style={{ marginBottom: 8 }}>
                批处理与输出
              </Title>
              <Text type="secondary">批处理适合按目标数量生成成品，并将结果同步到标准化输出目录。</Text>
            </div>
            <List
              size="small"
              dataSource={[
                "批处理目标数量：决定这次希望拿到多少个成品账号。",
                "输出目录根路径：默认是项目目录下的 output_tokens 文件夹。",
                "输出结构：完整账号会分别生成 cpa 和 subapi 两种格式，但统计时按同一账号去重。",
                "批量注册：无论是否开启 access-only，都只保留本地输出文件，用于手动导入或打包下载，不自动推送到 CPA。",
                "目录工具：支持下载 ZIP，也支持一键清空当前 output_tokens 批处理产物。",
                "开始批处理前，建议先确认邮箱 Provider、CPA 配置和保存配置都已经完成。",
              ]}
              renderItem={(item) => (
                <List.Item>
                  <Text>{item}</Text>
                </List.Item>
              )}
            />
            <pre className="guide-code-block">{`output_tokens/
  cpa/
  subapi/`}</pre>
          </Space>
        </div>

        <div ref={registerSectionRef("advanced")} className="guide-section-card">
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            <div>
              <Title level={4} style={{ marginBottom: 8 }}>
                高级设置
              </Title>
              <Text type="secondary">适合调整运行保护、重试策略、输出行为和登录安全，不建议首次部署时一次性改太多。</Text>
            </div>
            <List
              size="small"
              dataSource={[
                "运行保护：控制连续失败阈值、冷却时长和循环抖动。",
                "注册策略：控制入口模式和失败回退行为。",
                "OAuth 策略：控制重试次数、退避基数和最大退避。",
                "输出设置：控制批量注册的本地输出，以及循环补号在 access-only 模式下如何跳过手机号并继续推送到 CPA。",
                "访问安全：可以直接修改登录页密码，修改后后续登录使用新密码。",
              ]}
              renderItem={(item) => (
                <List.Item>
                  <Text>{item}</Text>
                </List.Item>
              )}
            />
            <Card size="small" title="跳过手机号使用指南">
              <Space direction="vertical" size={10} style={{ width: "100%" }}>
                <Alert
                  showIcon
                  type="success"
                  message="如果日志出现 add_phone、phone_verification、手机号验证不通过"
                  description="优先去 高级设置 -> 输出设置，开启对应任务的“允许仅 access_token 成功”。保存后重新启动任务，系统会在拿到 access_token 后提前收口，尽量不再进入容易卡手机验证的后半段。"
                />
                <List
                  size="small"
                  dataSource={[
                    "批量注册：开启“批量注册允许仅 access_token 成功”。产物只保存在本地，适合提速、攒号、打包下载。",
                    "循环补号 / 单次维护：开启“循环补号允许仅 access_token 成功”。维护模式仍可推送到 CPA，更适合持续补可用号。",
                    "最大好处：很多本来会死在手机号验证的号，现在能直接收成。",
                    "主要代价：通常拿不到完整 refresh_token，所以额度面板、续期和完整度会弱一些。",
                  ]}
                  renderItem={(item) => (
                    <List.Item>
                      <Text>{item}</Text>
                    </List.Item>
                  )}
                />
              </Space>
            </Card>
            <Alert
              showIcon
              type="warning"
              message="原始 Markdown 仍然保留"
              description="如果你要复制给别人、保存到仓库或导出文档，可以切换到上方的 Markdown 视图。"
            />
          </Space>
        </div>
      </div>
    </div>
  );
}

function UserGuideDrawer(props: { open: boolean; onClose: () => void }) {
  const { open, onClose } = props;
  const [mode, setMode] = useState<"read" | "markdown">("read");
  const [copying, setCopying] = useState(false);

  const handleCopy = async () => {
    try {
      setCopying(true);
      await navigator.clipboard.writeText(USER_GUIDE_MARKDOWN);
    } catch {
      // noop
    } finally {
      setCopying(false);
    }
  };

  return (
    <Drawer
      title="使用说明文档"
      width={1120}
      open={open}
      onClose={onClose}
      extra={
        <Space>
          <Button icon={<CopyOutlined />} onClick={handleCopy} loading={copying}>
            复制 Markdown
          </Button>
        </Space>
      }
    >
      <Space direction="vertical" size={16} style={{ width: "100%" }}>
        <Segmented
          block
          value={mode}
          onChange={(value) => setMode(value as "read" | "markdown")}
          options={[
            { label: "阅读版", value: "read" },
            { label: "Markdown", value: "markdown" },
          ]}
        />
        {mode === "read" ? (
          <UserGuideReadView />
        ) : (
          <div className="guide-markdown-shell">
            <pre className="guide-markdown-raw">{USER_GUIDE_MARKDOWN}</pre>
          </div>
        )}
      </Space>
    </Drawer>
  );
}

function LoginView(props: { busy: boolean; error: string; onSubmit: (token: string) => Promise<void> }) {
  const { busy, error, onSubmit } = props;
  const [token, setToken] = useState("");
  const [guideOpen, setGuideOpen] = useState(false);

  return (
    <div className="login-shell">
      <LoginBackground />
      <div className="login-top-actions">
        <Button icon={<FileTextOutlined />} onClick={() => setGuideOpen(true)}>
          使用说明
        </Button>
      </div>
      <Card className="login-card">
        <Space direction="vertical" size={20} style={{ width: "100%" }}>
          <div>
            <Title level={3} style={{ marginBottom: 8 }}>
              管理登录
            </Title>
            <Text type="secondary">请输入管理令牌以访问控制台并读取实时运行状态</Text>
          </div>
          <Form layout="vertical" onFinish={() => onSubmit(token.trim())}>
            <Form.Item label="Admin Token" required extra={<Text type="secondary">首次启动请以 admin_token.txt 或 APP_ADMIN_TOKEN 为准</Text>}>
              <Input.Password
                prefix={<LockOutlined />}
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="请输入 X-Admin-Token"
              />
            </Form.Item>
            {error ? <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} /> : null}
            <Button type="primary" htmlType="submit" block loading={busy} disabled={!token.trim()}>
              进入控制台
            </Button>
          </Form>
        </Space>
      </Card>
      <UserGuideDrawer open={guideOpen} onClose={() => setGuideOpen(false)} />
    </div>
  );
}

function StatusTag(props: { mode: RuntimeMode }) {
  const { mode } = props;
  if (mode === "loop") {
    return <Tag color="success">循环补号运行中</Tag>;
  }
  if (mode === "single") {
    return <Tag color="processing">单次维护运行中</Tag>;
  }
  return <Tag>空闲</Tag>;
}

function ProviderFields(props: {
  provider: string;
  domainRegistryState: DomainRegistryState;
  checkedMailDomains: string[];
  connectedMailDomains: string[];
  missingMailDomains: string[];
}) {
  const { provider, domainRegistryState, checkedMailDomains, connectedMailDomains, missingMailDomains } = props;

  if (provider === "self_hosted_mail_api") {
    return (
      <>
        <Form.Item label="邮件 API 地址" name="mailApiBase" rules={[{ required: true, message: "请输入邮件 API 地址" }]}>
          <Input placeholder="https://tools.example.com/mail-bridge" />
        </Form.Item>
        <Form.Item label="邮件 API 密钥" name="mailApiKey" rules={[{ required: true, message: "请输入 API 密钥" }]}>
          <Input.Password placeholder="请输入 API 密钥" />
        </Form.Item>
        <Form.Item label="邮箱域名" name="mailDomain" rules={[{ required: true, message: "请输入邮箱域名" }]}>
          <Input placeholder="mail.example.com" />
        </Form.Item>
        <Form.Item
          label="邮箱域名列表"
          name="mailDomains"
          extra="支持一行一个根域名。开启混合调用后，注册时会在这里填写的域名之间轮换，不再只走主域名。"
        >
          <Input.TextArea autoSize={{ minRows: 3, maxRows: 5 }} placeholder={"intereloucer.com\ninterestloucered.com"} />
        </Form.Item>
        <Form.Item
          label="混合调用域名列表"
          name="mailMixDomainRotation"
          valuePropName="checked"
          extra="关闭时只走上方主域名；开启后按邮箱域名列表混合轮换调用。"
        >
          <Switch checkedChildren="开启" unCheckedChildren="关闭" />
        </Form.Item>
        <Form.Item
          label="启用随机子域名"
          name="mailUseRandomSubdomain"
          valuePropName="checked"
          tooltip="开启后会基于 mailDomain / mailDomains 自动生成随机子域名邮箱，适合已配置泛域名接收的自建邮箱服务。"
        >
          <Switch checkedChildren="开启" unCheckedChildren="关闭" />
        </Form.Item>
        <Form.Item
          label="子域名前缀长度"
          name="mailRandomSubdomainLength"
          tooltip="只在开启随机子域名时生效。推荐 6，范围 3-24。"
        >
          <InputNumber min={3} max={24} precision={0} style={{ width: "100%" }} />
        </Form.Item>
        {domainRegistryState.loading ? (
          <Alert showIcon type="info" message="正在校验服务器接码平台中的域名接入状态..." />
        ) : null}
        {domainRegistryState.error ? (
          <Alert showIcon type="error" message="域名接入校验失败" description={domainRegistryState.error} />
        ) : null}
        {!domainRegistryState.loading && !domainRegistryState.error && domainRegistryState.result ? (
          <Space direction="vertical" size={10} style={{ width: "100%" }} className="domain-registry-panel">
            <Alert
              showIcon
              type={missingMailDomains.length > 0 ? "warning" : "success"}
              message={missingMailDomains.length > 0 ? "存在未接入的邮箱域名" : "填写域名均已在服务器接码平台接入"}
              description={
                missingMailDomains.length > 0
                  ? "下面红色域名当前还没有在服务器接码平台接入，注册时无法正常混合调用。"
                  : `已检测到 ${domainRegistryState.result.enabled_domains.length} 个可用域名，可直接参与调用。`
              }
            />
            {checkedMailDomains.length > 0 ? (
              <div className="domain-check-group">
                {checkedMailDomains.map((domain) => (
                  <Tag key={domain} color={missingMailDomains.includes(domain) ? "error" : "success"}>
                    {missingMailDomains.includes(domain) ? `未接入: ${domain}` : `已接入: ${domain}`}
                  </Tag>
                ))}
              </div>
            ) : null}
            <Text type="secondary">
              服务器当前已接入域名：{domainRegistryState.result.enabled_domains.join("、") || "暂无"}
            </Text>
            {connectedMailDomains.length > 0 ? (
              <Text type="secondary">本次配置已命中 {connectedMailDomains.length} 个可用域名，可参与轮换调用。</Text>
            ) : null}
          </Space>
        ) : null}
      </>
    );
  }

  if (provider === "cfmail") {
    return (
      <>
        <Form.Item label="接口地址" name="mailApiBase" rules={[{ required: true, message: "请输入 CF Mail 接口地址" }]}>
          <Input placeholder="https://mail-worker.example.com" />
        </Form.Item>
        <Form.Item label="接口密钥" name="mailApiKey" rules={[{ required: true, message: "请输入 CF Mail 接口密钥" }]}>
          <Input.Password placeholder="请输入 CF Mail 管理密钥" />
        </Form.Item>
        <Form.Item label="邮箱域名" name="mailDomain" extra="主域名留空时，会默认取邮箱域名列表的第一项。">
          <Input placeholder="mail.example.com" />
        </Form.Item>
        <Form.Item label="邮箱域名列表" name="mailDomains" rules={[{ required: true, message: "请至少填写一个 CF Mail 域名" }]}>
          <Input.TextArea autoSize={{ minRows: 3, maxRows: 5 }} placeholder="每行一个域名" />
        </Form.Item>
        <Form.Item
          label="启用随机子域名"
          name="mailUseRandomSubdomain"
          valuePropName="checked"
          tooltip="前提是你的 CF Mail / Cloudflare 邮件链路已经支持对应根域名下的子域收信。"
        >
          <Switch checkedChildren="开启" unCheckedChildren="关闭" />
        </Form.Item>
        <Form.Item
          label="子域名前缀长度"
          name="mailRandomSubdomainLength"
          tooltip="只在开启随机子域名时生效。推荐 6，范围 3-24。"
        >
          <InputNumber min={3} max={24} precision={0} style={{ width: "100%" }} />
        </Form.Item>
      </>
    );
  }

  if (provider === "duckmail") {
    return (
      <>
        <Form.Item label="接口地址" name="mailApiBase">
          <Input placeholder="https://api.duckmail.sbs" />
        </Form.Item>
        <Form.Item label="访问凭证" name="mailApiKey" rules={[{ required: true, message: "请输入 DuckMail bearer" }]}>
          <Input.Password placeholder="请输入 bearer" />
        </Form.Item>
        <Form.Item label="邮箱域名" name="mailDomain">
          <Input placeholder="duckmail.sbs" />
        </Form.Item>
        <Form.Item label="邮箱域名列表" name="mailDomains">
          <Input.TextArea autoSize={{ minRows: 3, maxRows: 5 }} placeholder="每行一个域名" />
        </Form.Item>
        <Form.Item
          label="启用随机子域名"
          name="mailUseRandomSubdomain"
          valuePropName="checked"
          tooltip="DuckMail 官方接口支持按完整 address 创建账号；前提是这里填写的根域名已在 DuckMail 侧验证可用。"
        >
          <Switch checkedChildren="开启" unCheckedChildren="关闭" />
        </Form.Item>
        <Form.Item
          label="子域名前缀长度"
          name="mailRandomSubdomainLength"
          tooltip="只在开启随机子域名时生效。推荐 6，范围 3-24。"
        >
          <InputNumber min={3} max={24} precision={0} style={{ width: "100%" }} />
        </Form.Item>
      </>
    );
  }

  return (
    <Form.Item label="接口地址" name="mailApiBase">
      <Input placeholder="https://api.tempmail.lol/v2" />
    </Form.Item>
  );
}

function DashboardInner() {
  const [isDark, setIsDark] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [logFilter, setLogFilter] = useState<LogTone>("all");
  const [authenticated, setAuthenticated] = useState<boolean>(Boolean(getStoredAuth().token));
  const [authError, setAuthError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [config, setConfig] = useState<BackendConfig>(normalizeBackendConfig(defaultBackendConfig));
  const [monitor, setMonitor] = useState<MonitorState | null>(null);
  const [batchMonitor, setBatchMonitor] = useState<BatchMonitorState | null>(null);
  const [outputInventory, setOutputInventory] = useState<OutputInventoryState | null>(null);
  const [domainRegistryState, setDomainRegistryState] = useState<DomainRegistryState>({
    loading: false,
    result: null,
    error: "",
  });
  const [batchTarget, setBatchTarget] = useState<number>(getStoredBatchTarget);
  const [logScope, setLogScope] = useState<LogScope>("maintainer");
  const [adminTokenDraft, setAdminTokenDraft] = useState("");
  const [adminTokenConfirm, setAdminTokenConfirm] = useState("");
  const [adminTokenBusy, setAdminTokenBusy] = useState(false);
  const [setupGuideOpen, setSetupGuideOpen] = useState(false);
  const [setupGuideDismissed, setSetupGuideDismissed] = useState(false);
  const [setupGuideForceOpen, setSetupGuideForceOpen] = useState(false);
  const [topPanelSyncHeight, setTopPanelSyncHeight] = useState<number | null>(null);
  const [logPanelSyncHeight, setLogPanelSyncHeight] = useState<number | null>(null);
  const [form] = Form.useForm<typeof initialValues>();
  const { message } = AntdApp.useApp();
  const provider = Form.useWatch("provider", form) ?? config.mail.provider;
  const watchedMailApiBase = Form.useWatch("mailApiBase", form);
  const watchedMailApiKey = Form.useWatch("mailApiKey", form);
  const watchedMailDomain = Form.useWatch("mailDomain", form);
  const watchedMailDomains = Form.useWatch("mailDomains", form);
  const watchedMailMixDomainRotation = Form.useWatch("mailMixDomainRotation", form);
  const watchedMailUseRandomSubdomain = Form.useWatch("mailUseRandomSubdomain", form);
  const watchedMailRandomSubdomainLength = Form.useWatch("mailRandomSubdomainLength", form);
  const watchedOtpTimeoutSeconds = Form.useWatch("otpTimeoutSeconds", form);
  const watchedPollIntervalSeconds = Form.useWatch("pollIntervalSeconds", form);
  const watchedBatchAllowAccessTokenOnly = Form.useWatch("batchAllowAccessTokenOnly", form);
  const watchedMaintainerAllowAccessTokenOnly = Form.useWatch("maintainerAllowAccessTokenOnly", form);
  const providerDraftsRef = useRef<Record<string, ProviderSnapshotFields>>(buildProviderDrafts(config));
  const previousProviderRef = useRef<string>(config.mail.provider);
  const logPanelRef = useRef<HTMLDivElement | null>(null);
  const topRightPanelRef = useRef<HTMLDivElement | null>(null);
  const setupGuidePreviewRequested = useMemo(
    () => new URLSearchParams(window.location.search).get("wizard") === "preview",
    [],
  );
  const setupGuidePreviewOpenedRef = useRef(false);
  const checkedMailDomains = useMemo(
    () =>
      Array.from(
        new Set([
          normalizeDomainText(watchedMailDomain),
          ...normalizeDomainList(watchedMailDomains),
        ].filter(Boolean)),
      ),
    [watchedMailDomain, watchedMailDomains],
  );
  const domainRegistryEnabledSet = useMemo(
    () => new Set((domainRegistryState.result?.enabled_domains ?? []).map((item) => normalizeDomainText(item))),
    [domainRegistryState.result],
  );
  const connectedMailDomains = useMemo(
    () => checkedMailDomains.filter((item) => domainRegistryEnabledSet.has(item)),
    [checkedMailDomains, domainRegistryEnabledSet],
  );
  const missingMailDomains = useMemo(
    () => checkedMailDomains.filter((item) => !domainRegistryEnabledSet.has(item)),
    [checkedMailDomains, domainRegistryEnabledSet],
  );

  const themeConfig = {
    algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
    token: {
      colorPrimary: "#1677ff",
      borderRadius: 10,
      colorBgLayout: isDark ? "#0f172a" : "#f5f7fa",
    },
    components: {
      Card: {
        bodyPadding: 20,
        headerFontSize: 16,
      },
    },
  } as const;

  const handleUnauthorized = () => {
    clearAuthToken();
    setAuthenticated(false);
    setAuthError("登录已失效，请重新输入管理令牌");
    setLoading(false);
  };

  useEffect(() => {
    if (!authenticated) {
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);

    Promise.all([fetchBackendConfig(), fetchMonitorState(), fetchBatchState(), fetchOutputInventoryState()])
      .then(([nextConfig, nextMonitor, nextBatchMonitor, nextOutputInventory]) => {
        if (!active) {
          return;
        }
        setConfig(nextConfig);
        providerDraftsRef.current = buildProviderDrafts(nextConfig);
        previousProviderRef.current = nextConfig.mail.provider;
        form.setFieldsValue(configToFormValues(nextConfig));
        setMonitor(nextMonitor);
        setBatchMonitor(nextBatchMonitor);
        setOutputInventory(nextOutputInventory);
        setDirty(false);
      })
      .catch((error) => {
        if (!active) {
          return;
        }
        if (isAuthError(error)) {
          handleUnauthorized();
          return;
        }
        message.error("加载配置或运行状态失败");
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [authenticated, form, message]);

  useEffect(() => {
    const previousProvider = previousProviderRef.current;
    if (!provider || previousProvider === provider) {
      return;
    }

    providerDraftsRef.current[previousProvider] = {
      mailApiBase: String(watchedMailApiBase ?? ""),
      mailApiKey: String(watchedMailApiKey ?? ""),
      mailDomain: String(watchedMailDomain ?? ""),
      mailDomains: String(watchedMailDomains ?? ""),
      mailMixDomainRotation: Boolean(watchedMailMixDomainRotation),
      mailUseRandomSubdomain: Boolean(watchedMailUseRandomSubdomain),
      mailRandomSubdomainLength: Number(watchedMailRandomSubdomainLength ?? 6),
    };

    const nextSnapshot = providerDraftsRef.current[provider] ?? getProviderFormSnapshot(config, provider);
    form.setFieldsValue(nextSnapshot);
    previousProviderRef.current = provider;
  }, [
    config,
    form,
    provider,
    watchedMailApiBase,
    watchedMailApiKey,
    watchedMailDomain,
    watchedMailDomains,
    watchedMailMixDomainRotation,
    watchedMailUseRandomSubdomain,
    watchedMailRandomSubdomainLength,
  ]);

  useEffect(() => {
    if (!authenticated || provider !== "self_hosted_mail_api") {
      setDomainRegistryState({ loading: false, result: null, error: "" });
      return;
    }

    const normalizedApiBase = String(watchedMailApiBase ?? "").trim();
    const normalizedApiKey = String(watchedMailApiKey ?? "").trim();
    if (!normalizedApiBase || !normalizedApiKey) {
      setDomainRegistryState({ loading: false, result: null, error: "" });
      return;
    }

    let active = true;
    const timer = window.setTimeout(() => {
      setDomainRegistryState((previous) => ({
        loading: true,
        result: previous.result,
        error: "",
      }));

      checkMailDomainRegistry({
        provider,
        api_base: normalizedApiBase,
        api_key: normalizedApiKey,
      })
        .then((result) => {
          if (!active) {
            return;
          }
          setDomainRegistryState({
            loading: false,
            result,
            error: result.ok ? "" : result.message,
          });
        })
        .catch((error) => {
          if (!active) {
            return;
          }
          if (isAuthError(error)) {
            handleUnauthorized();
            return;
          }
          setDomainRegistryState({
            loading: false,
            result: null,
            error: "域名接入校验失败，请检查邮件 API 地址、密钥或服务器接码平台状态",
          });
        });
    }, 500);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [authenticated, provider, watchedMailApiBase, watchedMailApiKey]);

  useEffect(() => {
    const panel = topRightPanelRef.current;
    if (!panel) {
      return;
    }

    const syncHeight = () => {
      if (window.innerWidth < 1200) {
        setTopPanelSyncHeight(null);
        return;
      }
      const nextHeight = Math.ceil(panel.getBoundingClientRect().height);
      setTopPanelSyncHeight(nextHeight > 0 ? nextHeight : null);
    };

    syncHeight();

    const resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(syncHeight) : null;
    resizeObserver?.observe(panel);
    window.addEventListener("resize", syncHeight);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", syncHeight);
    };
  }, [authenticated, provider, domainRegistryState, watchedOtpTimeoutSeconds, watchedPollIntervalSeconds]);

  useEffect(() => {
    const logPanel = logPanelRef.current;
    const mailCard = document.getElementById("mail-config-card");
    if (!logPanel || !mailCard) {
      return;
    }

    const syncLogHeight = () => {
      if (window.innerWidth < 1200) {
        setLogPanelSyncHeight(null);
        return;
      }
      const logTop = logPanel.getBoundingClientRect().top;
      const mailBottom = mailCard.getBoundingClientRect().bottom;
      const nextHeight = Math.floor(mailBottom - logTop);
      setLogPanelSyncHeight(nextHeight > 180 ? nextHeight : null);
    };

    syncLogHeight();

    const resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(syncLogHeight) : null;
    resizeObserver?.observe(mailCard);
    resizeObserver?.observe(logPanel);
    window.addEventListener("resize", syncLogHeight);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", syncLogHeight);
    };
  }, [authenticated, provider, domainRegistryState, watchedOtpTimeoutSeconds, watchedPollIntervalSeconds]);

  useEffect(() => {
    if (!authenticated) {
      return;
    }

    const timer = window.setInterval(() => {
      Promise.all([fetchMonitorState(), fetchBatchState(), fetchOutputInventoryState()])
        .then(([nextMonitor, nextBatchMonitor, nextOutputInventory]) => {
          setMonitor(nextMonitor);
          setBatchMonitor(nextBatchMonitor);
          setOutputInventory(nextOutputInventory);
        })
        .catch((error) => {
          if (isAuthError(error)) {
            handleUnauthorized();
          }
        });
    }, 5000);

    return () => {
      window.clearInterval(timer);
    };
  }, [authenticated]);

  const handleSave = async () => {
    setBusy(true);
    try {
      const values = await form.validateFields();
      const saved = await saveBackendConfig(formValuesToConfig(values, config));
      setConfig(saved);
      providerDraftsRef.current = buildProviderDrafts(saved);
      previousProviderRef.current = saved.mail.provider;
      form.setFieldsValue(configToFormValues(saved));
      setDirty(false);
      message.success("配置已保存");
    } catch (error) {
      if (isAuthError(error)) {
        handleUnauthorized();
      } else {
        message.error("保存配置失败");
      }
    } finally {
      setBusy(false);
    }
  };

  const handleStartSingle = async () => {
    setBusy(true);
    try {
      const values = await form.validateFields();
      const saved = await saveBackendConfig(formValuesToConfig(values, config));
      const result = await startRuntime();
      const nextMonitor = await fetchMonitorState();
      setConfig(saved);
      providerDraftsRef.current = buildProviderDrafts(saved);
      previousProviderRef.current = saved.mail.provider;
      form.setFieldsValue(configToFormValues(saved));
      setMonitor(nextMonitor);
      setDirty(false);
      message.success(result.message);
    } catch (error) {
      if (isAuthError(error)) {
        handleUnauthorized();
      } else {
        message.error("启动单次维护失败");
      }
    } finally {
      setBusy(false);
    }
  };

  const handleStartLoop = async () => {
    setBusy(true);
    try {
      const values = await form.validateFields();
      const saved = await saveBackendConfig(formValuesToConfig(values, config));
      const result = await startRuntimeLoop();
      const nextMonitor = await fetchMonitorState();
      setConfig(saved);
      providerDraftsRef.current = buildProviderDrafts(saved);
      previousProviderRef.current = saved.mail.provider;
      form.setFieldsValue(configToFormValues(saved));
      setMonitor(nextMonitor);
      setDirty(false);
      message.success(result.message);
    } catch (error) {
      if (isAuthError(error)) {
        handleUnauthorized();
      } else {
        message.error("启动循环补号失败");
      }
    } finally {
      setBusy(false);
    }
  };

  const handleRefresh = async () => {
    setBusy(true);
    try {
      const [nextConfig, nextMonitor, nextBatchMonitor, nextOutputInventory] = await Promise.all([
        fetchBackendConfig(),
        fetchMonitorState(),
        fetchBatchState(),
        fetchOutputInventoryState(),
      ]);
      setConfig(nextConfig);
      providerDraftsRef.current = buildProviderDrafts(nextConfig);
      previousProviderRef.current = nextConfig.mail.provider;
      form.setFieldsValue(configToFormValues(nextConfig));
      setMonitor(nextMonitor);
      setBatchMonitor(nextBatchMonitor);
      setOutputInventory(nextOutputInventory);
      setDirty(false);
      message.success("已刷新最新状态");
    } catch (error) {
      if (isAuthError(error)) {
        handleUnauthorized();
      } else {
        message.error("刷新状态失败");
      }
    } finally {
      setBusy(false);
    }
  };

  const handleLogin = async (token: string) => {
    setBusy(true);
    setAuthError("");
    try {
      await verifyAuthToken(token);
      storeAuthToken(token);
      setSetupGuideDismissed(false);
      setSetupGuideForceOpen(false);
      setAuthenticated(true);
      message.success("登录成功");
    } catch {
      clearAuthToken();
      setAuthenticated(false);
      setAuthError("管理令牌无效或服务不可用");
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = () => {
    clearAuthToken();
    setAuthenticated(false);
    setAuthError("");
    setDirty(false);
    setSetupGuideOpen(false);
    setSetupGuideDismissed(false);
    setSetupGuideForceOpen(false);
    setMonitor(null);
    setBatchMonitor(null);
    setOutputInventory(null);
    message.info("已退出登录");
  };

  const handleUpdateAdminToken = async () => {
    const nextToken = adminTokenDraft.trim();
    const confirmToken = adminTokenConfirm.trim();

    if (!nextToken) {
      message.warning("请输入新的登录页密码");
      return;
    }
    if (nextToken.length < 6) {
      message.warning("登录页密码至少需要 6 位");
      return;
    }
    if (nextToken !== confirmToken) {
      message.warning("两次输入的登录页密码不一致");
      return;
    }

    setAdminTokenBusy(true);
    try {
      const result = await updateAdminToken(nextToken);
      if (!result.ok) {
        message.error(result.message);
        return;
      }
      storeAuthToken(nextToken);
      setAdminTokenDraft("");
      setAdminTokenConfirm("");
      message.success(result.message);
    } catch (error) {
      if (isAuthError(error)) {
        handleUnauthorized();
      } else {
        message.error("更新登录页密码失败");
      }
    } finally {
      setAdminTokenBusy(false);
    }
  };

  const handleBatchTargetChange = (value: number | null) => {
    const normalized = Math.max(1, Math.floor(Number(value ?? 1) || 1));
    setBatchTarget(normalized);
    window.localStorage.setItem(BATCH_TARGET_STORAGE_KEY, String(normalized));
  };

  const handleOpenBatchPanel = () => {
    setLogScope("batch");
    window.setTimeout(() => {
      document.getElementById("batch-task-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  };

  const handleOpenPrimaryConfig = () => {
    setSetupGuideOpen(false);
    setSetupGuideDismissed(true);
    setSetupGuideForceOpen(false);
    window.setTimeout(() => {
      document.getElementById("core-config-card")?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 0);
  };

  const handleOpenMailConfig = () => {
    setSetupGuideOpen(false);
    setSetupGuideDismissed(true);
    setSetupGuideForceOpen(false);
    window.setTimeout(() => {
      document.getElementById("mail-config-card")?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 0);
  };

  const handleOpenActionBar = () => {
    setSetupGuideOpen(false);
    setSetupGuideDismissed(true);
    setSetupGuideForceOpen(false);
    window.setTimeout(() => {
      document.getElementById("runtime-action-bar")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  };

  const handleCloseSetupGuide = () => {
    setSetupGuideOpen(false);
    setSetupGuideDismissed(true);
    setSetupGuideForceOpen(false);
  };

  const handlePreviewSetupGuide = () => {
    setSetupGuideForceOpen(true);
    setSetupGuideOpen(true);
    setSetupGuideDismissed(true);
  };

  const handleDownloadOutputArchive = async () => {
    if ((outputInventory?.cpa.fileCount ?? 0) + (outputInventory?.subapi.fileCount ?? 0) <= 0) {
      message.info("当前还没有可下载的账号文件");
      return;
    }

    setBusy(true);
    try {
      const { blob, filename } = await downloadOutputArchive();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = filename || `output_tokens_${Date.now()}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);
      message.success("账号压缩包已开始下载");
    } catch (error) {
      if (isAuthError(error)) {
        handleUnauthorized();
      } else {
        message.error("下载账号压缩包失败，请检查鉴权状态、后端可访问性或当前部署的 API 基址配置");
      }
    } finally {
      setBusy(false);
    }
  };

  const handleClearOutputInventory = async () => {
    if (
      !window.confirm(
        "确认清空当前批处理输出目录吗？这会删除 output_tokens 下当前批处理生成的账号文件，且不可恢复。",
      )
    ) {
      return;
    }

    setBusy(true);
    try {
      const result = await clearOutputInventory();
      if (!result.ok) {
        message.warning(result.message || "清空输出目录失败");
        return;
      }
      const nextOutputInventory = await fetchOutputInventoryState();
      setOutputInventory(nextOutputInventory);
      message.success(result.message || "输出目录已清空");
    } catch (error) {
      if (isAuthError(error)) {
        handleUnauthorized();
      } else {
        message.error("清空输出目录失败");
      }
    } finally {
      setBusy(false);
    }
  };

  const handleStartBatch = async () => {
    setBusy(true);
    try {
      const values = await form.validateFields();
      const saved = await saveBackendConfig(formValuesToConfig(values, config));
      const result = await startBatchRuntime(batchTarget);
      if (!result.ok) {
        message.error(result.message);
        return;
      }
      const [nextBatchMonitor, nextOutputInventory] = await Promise.all([fetchBatchState(), fetchOutputInventoryState()]);
      setConfig(saved);
      providerDraftsRef.current = buildProviderDrafts(saved);
      previousProviderRef.current = saved.mail.provider;
      form.setFieldsValue(configToFormValues(saved));
      setBatchMonitor(nextBatchMonitor);
      setOutputInventory(nextOutputInventory);
      setDirty(false);
      handleOpenBatchPanel();
      message.success(result.message);
    } catch (error) {
      if (isAuthError(error)) {
        handleUnauthorized();
      } else {
        message.error("启动批处理失败");
      }
    } finally {
      setBusy(false);
    }
  };

  const handleStopTask = async () => {
    const shouldStopBatch = (logScope === "batch" && batchMonitor?.running) || (!monitor?.running && !!batchMonitor?.running);
    if (mode === "idle" && !batchMonitor?.running) {
      message.info("当前没有正在执行的任务");
      return;
    }

    setBusy(true);
    try {
      if (shouldStopBatch) {
        const result = await stopBatchRuntime();
        if (!result.ok) {
          message.error(result.message);
          return;
        }
        const [nextBatchMonitor, nextOutputInventory] = await Promise.all([fetchBatchState(), fetchOutputInventoryState()]);
        setBatchMonitor(nextBatchMonitor);
        setOutputInventory(nextOutputInventory);
        message.info(result.message);
      } else {
        const result = await stopRuntime();
        setMonitor(await fetchMonitorState());
        message.info(result.message);
      }
    } catch (error) {
      if (isAuthError(error)) {
        handleUnauthorized();
      } else {
        message.error("停止任务失败");
      }
    } finally {
      setBusy(false);
    }
  };

  const mode: RuntimeMode = !monitor?.running ? "idle" : monitor.loopRunning ? "loop" : "single";
  const providerLabel = providerStatusMap[provider] ?? provider;
  const statusMessage = monitor?.message ?? "等待后端状态...";
  const progressPercent = Math.max(0, Math.min(100, monitor?.percent ?? 0));
  const successCount = monitor?.stats.find((item) => item.tone === "success")?.value ?? 0;
  const failedCount = monitor?.stats.find((item) => item.tone === "danger")?.value ?? 0;
  const pendingCount =
    monitor?.stats.find((item) => item.tone === "pending")?.value ?? Math.max(0, (monitor?.total ?? 0) - successCount);
  const inventoryTarget = config.maintainer.min_candidates;
  const availableCandidates = monitor?.availableCandidates ?? null;
  const providerSnapshot = getProviderSnapshot(config, provider);
  const providerDomain =
    String(watchedMailDomain ?? "").trim() ||
    linesToArray(watchedMailDomains)[0] ||
    providerSnapshot.domain ||
    providerSnapshot.domains[0] ||
    "未设置";
  const inventoryGap =
    availableCandidates === null || availableCandidates === undefined
      ? null
      : Math.max(0, inventoryTarget - availableCandidates);
  const providerApiBase = providerSnapshot.apiBase || "未配置";
  const otpTimeoutSeconds = Number(watchedOtpTimeoutSeconds ?? config.mail.otp_timeout_seconds ?? 0);
  const pollIntervalSeconds = Number(watchedPollIntervalSeconds ?? config.mail.poll_interval_seconds ?? 0);
  const latestLogs = monitor?.logs ?? [];
  const batchPhaseLabel = phaseLabelMap[batchMonitor?.phase ?? "idle"] ?? (batchMonitor?.phase || "未知阶段");
  const batchProgressPercent = Math.max(0, Math.min(100, batchMonitor?.percent ?? 0));
  const batchCompleted = batchMonitor?.completed ?? outputInventory?.pairedAccountCount ?? 0;
  const batchTotal = batchMonitor?.total ?? batchMonitor?.targetCount ?? batchTarget;
  const batchRemaining = Math.max((batchTotal || batchTarget) - batchCompleted, 0);
  const batchFailedCount = batchMonitor?.stats.find((item) => item.tone === "danger")?.value ?? 0;
  const batchPendingCount = batchMonitor?.stats.find((item) => item.tone === "pending")?.value ?? batchRemaining;
  const outputRootPath = outputInventory?.rootPath || "C:\\path\\to\\your-project\\output_tokens";
  const lastBatchUpdateText = formatDateTime(outputInventory?.lastUpdatedAt);

  const batchLogs = useMemo<LogLine[]>(() => {
    if (batchMonitor?.logs?.length) {
      return batchMonitor.logs;
    }
    if (!outputInventory) {
      return [
        {
          id: "batch-loading",
          prefix: "[系统]",
          timestamp: "[--:--:--]",
          message: "正在读取批处理状态...",
          tone: "muted",
        },
      ];
    }
    return [
      {
        id: "batch-summary-fallback",
        prefix: "[统计]",
        timestamp: "[--:--:--]",
        message: `当前目录统计: 完整产物 ${outputInventory.pairedAccountCount} | CPA ${outputInventory.cpa.fileCount} | SubAPI ${outputInventory.subapi.fileCount}`,
        tone: outputInventory.pairedAccountCount > 0 ? "success" : "info",
      },
    ];
  }, [batchMonitor, outputInventory]);

  const activeLogs = logScope === "batch" ? batchLogs : latestLogs;
  const setupGuideItems = useMemo(() => getSetupGuideItems(config), [config]);
  const cpaGuideItems = useMemo(
    () => setupGuideItems.filter((item) => item.key === "cpa_base_url" || item.key === "cpa_token"),
    [setupGuideItems],
  );
  const mailGuideItems = useMemo(
    () => setupGuideItems.filter((item) => !["cpa_base_url", "cpa_token"].includes(item.key)),
    [setupGuideItems],
  );
  const prerequisitesReady = cpaGuideItems.length === 0 && mailGuideItems.length === 0;
  const setupWizardCurrent = cpaGuideItems.length > 0 ? 0 : mailGuideItems.length > 0 ? 1 : 2;

  const filteredLogs = useMemo(() => {
    if (logFilter === "all") {
      return activeLogs;
    }
    return activeLogs.filter((item) => item.tone === logFilter);
  }, [activeLogs, logFilter]);

  useEffect(() => {
    const panel = logPanelRef.current;
    if (!panel) {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      panel.scrollTop = panel.scrollHeight;
    });
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [logScope, logFilter, filteredLogs]);

  useEffect(() => {
    if (!authenticated || loading) {
      return;
    }
    if (setupGuideForceOpen) {
      if (!setupGuideOpen) {
        setSetupGuideOpen(true);
      }
      return;
    }
    if (setupGuidePreviewRequested && !setupGuidePreviewOpenedRef.current) {
      setupGuidePreviewOpenedRef.current = true;
      setSetupGuideForceOpen(true);
      setSetupGuideOpen(true);
      return;
    }
    if (setupGuideItems.length === 0) {
      setSetupGuideOpen(false);
      setSetupGuideDismissed(false);
      return;
    }
    if (!setupGuideDismissed) {
      setSetupGuideOpen(true);
    }
  }, [
    authenticated,
    loading,
    setupGuideDismissed,
    setupGuideForceOpen,
    setupGuideItems,
    setupGuideOpen,
    setupGuidePreviewRequested,
  ]);

  const timelineItems = useMemo(() => {
    const source = latestLogs.slice(-4).reverse();
    if (!source.length) {
      return [{ color: "gray", children: "暂无运行轨迹" }];
    }
    return source.map((item) => ({
      color: toneToTimelineColor(item.tone),
      children: (
        <Space direction="vertical" size={2}>
          <Text strong>{item.message}</Text>
          <Text type="secondary">
            {item.timestamp} {item.prefix}
          </Text>
        </Space>
      ),
    }));
  }, [latestLogs]);

  const monitorAlertDescription = monitor?.availableCandidatesError
    ? `可用账号数读取失败：${monitor.availableCandidatesError}`
    : mode === "idle"
      ? "当前没有运行中的维护任务，页面仍会每 5 秒自动同步一次后端状态。"
      : "当前页面已接入真实后端状态，进度、运行模式、日志与计时指标均来自服务端接口。";

  const modeValue = mode === "loop" ? "循环补号" : mode === "single" ? "单次维护" : "空闲";
  const phaseLabel = phaseLabelMap[monitor?.phase ?? "idle"] ?? (monitor?.phase || "未知阶段");

  if (!authenticated) {
    return (
      <ConfigProvider theme={themeConfig}>
        <LoginView busy={busy} error={authError} onSubmit={handleLogin} />
      </ConfigProvider>
    );
  }

  if (loading) {
    return (
      <ConfigProvider theme={themeConfig}>
        <div className="login-shell">
          <Spin size="large" tip="正在加载配置与运行状态..." />
        </div>
      </ConfigProvider>
    );
  }

  return (
    <ConfigProvider theme={themeConfig}>
      <Layout className="dashboard-layout">
        <Header
          className="dashboard-header"
          style={{
            background: isDark ? "rgba(15, 23, 42, 0.88)" : "rgba(255, 255, 255, 0.9)",
            borderBottom: isDark ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid rgba(5, 5, 5, 0.06)",
          }}
        >
          <Flex justify="space-between" align="center" gap={16} wrap>
            <div>
              <Title level={3} style={{ margin: 0 }}>
                账号池维护控制台
              </Title>
              <Text type="secondary">用于清理失效账号、补充新账号并监控维护任务</Text>
            </div>
            <Space id="runtime-action-bar" size={12} wrap>
              <StatusTag mode={mode} />
              {dirty ? <Tag color="gold">存在未保存变更</Tag> : null}
              <Button icon={<ReloadOutlined />} onClick={handleRefresh} loading={busy}>
                刷新状态
              </Button>
              <Button icon={<SettingOutlined />} onClick={() => setDrawerOpen(true)}>
                高级设置
              </Button>
              <Button onClick={handlePreviewSetupGuide}>安装向导</Button>
              <Button icon={<SaveOutlined />} onClick={handleSave} loading={busy} disabled={!dirty}>
                保存配置
              </Button>
              <Button icon={<PlayCircleOutlined />} onClick={handleStartSingle} loading={busy}>
                单次维护
              </Button>
              <Button type="primary" icon={<ThunderboltOutlined />} onClick={handleStartLoop} loading={busy}>
                循环补号
              </Button>
              <Button icon={<FolderOpenOutlined />} onClick={handleStartBatch} loading={busy}>
                开始批处理
              </Button>
              <Button danger icon={<StopOutlined />} onClick={handleStopTask} loading={busy}>
                停止任务
              </Button>
              <Button icon={<LogoutOutlined />} onClick={handleLogout}>
                退出
              </Button>
              <Space size={6}>
                <Text type="secondary">暗黑模式</Text>
                <Switch checked={isDark} onChange={setIsDark} />
              </Space>
            </Space>
          </Flex>
        </Header>

        <Content className="dashboard-content">
          <Form
            form={form}
            layout="vertical"
            initialValues={initialValues}
            onValuesChange={() => {
              setDirty(true);
            }}
          >
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={12} xl={6}>
                <Card>
                  <Statistic
                    title="当前可用账号"
                    value={availableCandidates ?? "--"}
                    prefix={<DatabaseOutlined />}
                    suffix={inventoryTarget ? `/ ${inventoryTarget}` : undefined}
                  />
                  <div className="card-inline-meta">
                    {inventoryGap !== null ? (
                      <Tag color={inventoryGap > 0 ? "error" : "success"}>
                        {inventoryGap > 0 ? `当前缺口 ${inventoryGap}` : "库存已达标"}
                      </Tag>
                    ) : (
                      <Tag>等待后端统计</Tag>
                    )}
                    <Text type="secondary">
                      {monitor?.availableCandidatesError ? "账号池读取异常" : "以服务端账号池统计结果为准"}
                    </Text>
                  </div>
                </Card>
              </Col>
              <Col xs={24} sm={12} xl={6}>
                <Card>
                  <Statistic title="本轮进度" value={progressPercent} precision={1} suffix="%" prefix={<ReloadOutlined />} />
                  <Progress percent={progressPercent} showInfo={false} strokeColor="#1677ff" />
                  <Flex justify="space-between" className="metric-row">
                    <Text type="secondary">已完成 {monitor?.completed ?? 0}</Text>
                    <Text type="secondary">失败 {failedCount}</Text>
                    <Text type="secondary">待补 {pendingCount}</Text>
                  </Flex>
                </Card>
              </Col>
              <Col xs={24} sm={12} xl={6}>
                <Card>
                  <Statistic title="邮箱源状态" value={providerLabel} valueStyle={{ fontSize: 22 }} prefix={<MailOutlined />} />
                  <div className="card-inline-meta">
                    <Tag color="processing">域名 {providerDomain}</Tag>
                    <Tag>{provider === "tempmail_lol" ? "公共接口" : "自定义接口"}</Tag>
                  </div>
                  <Text type="secondary">
                    验证码超时 {otpTimeoutSeconds}s，轮询间隔 {pollIntervalSeconds}s
                  </Text>
                </Card>
              </Col>
              <Col xs={24} sm={12} xl={6}>
                <Card>
                  <Statistic
                    title="运行模式"
                    value={modeValue}
                    valueStyle={{ fontSize: 22 }}
                    prefix={<FieldTimeOutlined />}
                  />
                  <div className="card-inline-meta">
                    <Tag color={mode === "idle" ? "default" : "success"}>
                      {mode === "loop"
                        ? formatLoopNextCheck(monitor?.loopNextCheckInSeconds)
                        : mode === "single"
                          ? "当前正在执行"
                          : "等待启动"}
                    </Tag>
                    <Tag>{phaseLabel}</Tag>
                  </div>
                  <Text type="secondary">{statusMessage}</Text>
                </Card>
              </Col>
            </Row>

            <Row gutter={[16, 16]} className="dashboard-top-panels-row">
              <Col xs={24} xl={16} className="top-section-col">
                <div
                  className="top-panel-stack"
                  style={topPanelSyncHeight ? { height: `${topPanelSyncHeight}px` } : undefined}
                >
                  <Card
                    className="monitor-card"
                    title="实时运行监控"
                    extra={
                      <Space split={<Divider type="vertical" />}>
                        <Text type="secondary">最近总耗时 {formatSeconds(monitor?.singleAccountTiming.latestTotalSeconds)}</Text>
                        <Text type="secondary">窗口均值 {formatSeconds(monitor?.singleAccountTiming.recentAvgTotalSeconds)}</Text>
                        <Text type="secondary">
                          慢号占比 {monitor?.singleAccountTiming.recentSlowCount ?? 0}/{monitor?.singleAccountTiming.sampleSize ?? 0}
                        </Text>
                      </Space>
                    }
                  >
                    <Space direction="vertical" size={16} style={{ width: "100%" }} className="monitor-stack">
                      <Alert
                        type={mode === "idle" ? "info" : monitor?.phase === "failed" ? "error" : "success"}
                        showIcon
                        message={statusMessage}
                        description={monitorAlertDescription}
                      />
                      <Row gutter={[12, 12]}>
                        <Col xs={24} md={10}>
                          <Card size="small" className="status-summary-card">
                            <Space direction="vertical" size={10} style={{ width: "100%" }}>
                              <Flex justify="space-between" align="center">
                                <Text type="secondary">当前阶段</Text>
                                <Tag color={mode === "idle" ? "default" : "processing"}>{phaseLabel}</Tag>
                              </Flex>
                              <Timeline items={timelineItems} />
                            </Space>
                          </Card>
                        </Col>
                        <Col xs={24} md={14}>
                          <Space direction="vertical" size={16} style={{ width: "100%" }}>
                            <Progress percent={progressPercent} strokeColor={mode === "idle" ? "#1677ff" : "#52c41a"} />
                            <Row gutter={[12, 12]}>
                              <Col xs={24} sm={8}>
                                <Card size="small">
                                  <Statistic title="成功" value={successCount} valueStyle={{ color: "#52c41a" }} />
                                </Card>
                              </Col>
                              <Col xs={24} sm={8}>
                                <Card size="small">
                                  <Statistic title="失败" value={failedCount} valueStyle={{ color: "#ff4d4f" }} />
                                </Card>
                              </Col>
                              <Col xs={24} sm={8}>
                                <Card size="small">
                                  <Statistic title="待处理" value={pendingCount} valueStyle={{ color: "#1677ff" }} />
                                </Card>
                              </Col>
                              <Col xs={24} sm={8}>
                                <Card size="small">
                                  <Statistic
                                    title="注册耗时"
                                    value={formatSeconds(monitor?.singleAccountTiming.latestRegSeconds)}
                                    valueStyle={{ fontSize: 20 }}
                                  />
                                </Card>
                              </Col>
                              <Col xs={24} sm={8}>
                                <Card size="small">
                                  <Statistic
                                    title="OAuth 耗时"
                                    value={formatSeconds(monitor?.singleAccountTiming.latestOauthSeconds)}
                                    valueStyle={{ fontSize: 20 }}
                                  />
                                </Card>
                              </Col>
                              <Col xs={24} sm={8}>
                                <Card size="small">
                                  <Statistic title="接口地址" value={providerApiBase} valueStyle={{ fontSize: 14 }} />
                                </Card>
                              </Col>
                            </Row>
                          </Space>
                        </Col>
                      </Row>
                      <Flex justify="space-between" align="center" wrap gap={12}>
                        <Space size={12} wrap>
                          <Text strong>运行日志</Text>
                          <Segmented<LogScope>
                            options={[
                              { label: "补号维护", value: "maintainer" },
                              { label: "批处理任务", value: "batch" },
                            ]}
                            value={logScope}
                            onChange={(value) => setLogScope(value as LogScope)}
                          />
                        </Space>
                        <Segmented<LogTone>
                          options={[
                            { label: "全部", value: "all" },
                            { label: "成功", value: "success" },
                            { label: "警告", value: "warning" },
                            { label: "错误", value: "danger" },
                            { label: "信息", value: "info" },
                          ]}
                          value={logFilter}
                          onChange={(value) => setLogFilter(value as LogTone)}
                        />
                      </Flex>
                      <div
                        ref={logPanelRef}
                        className="log-panel"
                        style={
                          logPanelSyncHeight
                            ? {
                                height: `${logPanelSyncHeight}px`,
                                minHeight: `${logPanelSyncHeight}px`,
                                maxHeight: `${logPanelSyncHeight}px`,
                              }
                            : undefined
                        }
                      >
                        <List
                          locale={{ emptyText: "暂无可展示日志" }}
                          dataSource={filteredLogs}
                          renderItem={(item) => (
                            <List.Item className="log-item">
                              <div className="log-row-grid">
                                <Space align="start" size={12} className="log-meta">
                                  <Text className="log-time">{item.timestamp}</Text>
                                  <Tag color={toneToTagColor(item.tone)}>{item.prefix}</Tag>
                                </Space>
                                <Text className="log-message">{item.message}</Text>
                              </div>
                            </List.Item>
                          )}
                        />
                      </div>
                    </Space>
                  </Card>
                </div>
              </Col>

              <Col xs={24} xl={8} className="top-section-col">
                <div className="top-panel-stack" ref={topRightPanelRef}>
                  <Card id="core-config-card" title="核心配置" extra={<ApiOutlined />}>
                    <Form.Item label="CPA 接口地址" name="cpaBaseUrl" rules={[{ required: true, message: "请输入 CPA 接口地址" }]}>
                      <Input placeholder="https://cli.example.com/" />
                    </Form.Item>
                    <Form.Item label="CPA 访问令牌" name="cpaToken" rules={[{ required: true, message: "请输入访问令牌" }]}>
                      <Input.Password placeholder="请输入访问令牌" />
                    </Form.Item>
                    <Row gutter={12}>
                      <Col span={12}>
                        <Form.Item label="目标保有量" name="minCandidates">
                          <InputNumber min={1} style={{ width: "100%" }} />
                        </Form.Item>
                      </Col>
                      <Col span={12}>
                        <Form.Item label="代理地址" name="proxy">
                          <Input placeholder="http://127.0.0.1:7897" />
                        </Form.Item>
                      </Col>
                    </Row>
                  </Card>

                  <Card id="mail-config-card" title="邮箱配置" extra={<MailOutlined />}>
                    <Form.Item label="邮箱提供方" name="provider">
                      <Select options={providerOptions} />
                    </Form.Item>
                    <ProviderFields
                      provider={provider}
                      domainRegistryState={domainRegistryState}
                      checkedMailDomains={checkedMailDomains}
                      connectedMailDomains={connectedMailDomains}
                      missingMailDomains={missingMailDomains}
                    />
                    <Row gutter={12}>
                      <Col span={12}>
                        <Form.Item label="验证码超时（秒）" name="otpTimeoutSeconds">
                          <InputNumber min={10} style={{ width: "100%" }} />
                        </Form.Item>
                      </Col>
                      <Col span={12}>
                        <Form.Item label="轮询间隔（秒）" name="pollIntervalSeconds">
                          <InputNumber min={1} style={{ width: "100%" }} />
                        </Form.Item>
                      </Col>
                    </Row>
                  </Card>
                </div>
              </Col>
            </Row>

            <Row gutter={[16, 16]}>
              <Col xs={24} xl={16}>
                <Card title="补号策略" extra={<ThunderboltOutlined />} className="strategy-card">
                  <Row gutter={12}>
                    <Col xs={24} sm={12}>
                      <Form.Item label="补号并发数" name="runWorkers">
                        <InputNumber min={1} style={{ width: "100%" }} />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={12}>
                      <Form.Item label="循环补号间隔（秒）" name="loopIntervalSeconds">
                        <InputNumber min={10} style={{ width: "100%" }} />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={12}>
                      <Form.Item label="验证码超时（秒）" name="otpTimeoutSeconds">
                        <InputNumber min={10} style={{ width: "100%" }} />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={12}>
                      <Form.Item label="邮件轮询间隔（秒）" name="pollIntervalSeconds">
                        <InputNumber min={1} style={{ width: "100%" }} />
                      </Form.Item>
                    </Col>
                  </Row>
                </Card>
              </Col>

              <Col xs={24} xl={8}>
                <Card title="清理策略" extra={<FilterOutlined />} className="strategy-card">
                  <Row gutter={12}>
                    <Col xs={24} sm={12}>
                      <Form.Item label="目标账号类型" name="cleanTargetType">
                        <Input placeholder="codex" />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={12}>
                      <Form.Item label="探测并发" name="cleanWorkers">
                        <InputNumber min={1} style={{ width: "100%" }} />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={12}>
                      <Form.Item label="删除并发" name="deleteWorkers">
                        <InputNumber min={1} style={{ width: "100%" }} />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={12}>
                      <Form.Item label="用量阈值" name="usedPercentThreshold">
                        <InputNumber min={0} max={100} style={{ width: "100%" }} />
                      </Form.Item>
                    </Col>
                    <Col xs={24}>
                      <Form.Item label="抽样数量" name="sampleSize">
                        <InputNumber min={0} style={{ width: "100%" }} />
                      </Form.Item>
                    </Col>
                  </Row>
                </Card>
              </Col>

              <Col xs={24} xl={16} id="batch-task-panel">
                <Card title="批处理任务" extra={<FolderOpenOutlined />} className="strategy-card">
                  <Space direction="vertical" size={16} style={{ width: "100%" }}>
                    <Alert
                      type={batchMonitor?.phase === "failed" ? "error" : batchMonitor?.running ? "success" : "info"}
                      showIcon
                      message="批处理任务面板"
                      description={batchMonitor?.message || "这里用于设置批处理目标数量、查看输出目录状态，并启动独立批处理任务。"}
                    />
                    <Row gutter={[12, 12]}>
                      <Col xs={24} sm={10}>
                        <Form.Item label="批处理目标数量">
                          <InputNumber min={1} style={{ width: "100%" }} value={batchTarget} onChange={handleBatchTargetChange} />
                        </Form.Item>
                      </Col>
                      <Col xs={24} sm={14}>
                        <Form.Item label="输出目录根路径">
                          <Input value={outputRootPath} readOnly />
                        </Form.Item>
                      </Col>
                      <Col xs={24} md={8}>
                        <Card size="small">
                          <Statistic title="完整产物数" value={batchCompleted} prefix={<DatabaseOutlined />} />
                        </Card>
                      </Col>
                      <Col xs={24} md={8}>
                        <Card size="small">
                          <Statistic title="距离目标" value={batchRemaining} prefix={<FieldTimeOutlined />} />
                        </Card>
                      </Col>
                      <Col xs={24} md={8}>
                        <Card size="small">
                          <Statistic title="目标完成度" value={batchProgressPercent} suffix="%" prefix={<ReloadOutlined />} />
                        </Card>
                      </Col>
                      <Col xs={24} md={8}>
                        <Card size="small">
                          <Statistic title="失败次数" value={batchFailedCount} valueStyle={{ color: "#ff4d4f" }} />
                        </Card>
                      </Col>
                      <Col xs={24} md={8}>
                        <Card size="small">
                          <Statistic title="待完成" value={batchPendingCount} valueStyle={{ color: "#1677ff" }} />
                        </Card>
                      </Col>
                      <Col xs={24} md={8}>
                        <Card size="small">
                          <Statistic title="当前状态" value={batchPhaseLabel} valueStyle={{ fontSize: 20 }} />
                        </Card>
                      </Col>
                    </Row>
                    <Progress percent={batchProgressPercent} showInfo={false} strokeColor="#1677ff" />
                    <Space size={8} wrap>
                      <Tag color={batchPhaseTagColor(batchMonitor?.phase, batchMonitor?.running)}>
                        {batchMonitor?.running ? "批处理中" : batchPhaseLabel}
                      </Tag>
                      <Tag color="processing">最近同步 {lastBatchUpdateText}</Tag>
                      <Tag>{outputInventory?.cpa.exists ? "CPA 目录已就绪" : "CPA 目录待创建"}</Tag>
                      <Tag>{outputInventory?.subapi.exists ? "SubAPI 目录已就绪" : "SubAPI 目录待创建"}</Tag>
                      <Tag color="geekblue">当前目录去重账号 {outputInventory?.uniqueAccountCount ?? 0}</Tag>
                      <Tag color="blue">目标 {batchTotal || batchTarget} / 已完成 {batchCompleted}</Tag>
                    </Space>
                    <Flex justify="flex-end" wrap gap={12}>
                    <Space direction="vertical" size={8}>
                      <Button danger icon={<DeleteOutlined />} onClick={handleClearOutputInventory} loading={busy}>
                        清空当前目录
                      </Button>
                      <Button icon={<DownloadOutlined />} onClick={handleDownloadOutputArchive} loading={busy}>
                        下载账号压缩包
                      </Button>
                    </Space>
                    </Flex>
                    <Card size="small">
                      <Row gutter={[12, 12]}>
                        <Col xs={24} md={8}>
                          <Text type="secondary">批处理目标</Text>
                          <div>
                            <Text strong>{batchTotal || batchTarget}</Text>
                          </div>
                        </Col>
                        <Col xs={24} md={8}>
                          <Text type="secondary">最近日志文件</Text>
                          <div>
                            <Text ellipsis>{batchMonitor?.lastLogPath || "暂无"}</Text>
                          </div>
                        </Col>
                        <Col xs={24} md={8}>
                          <Text type="secondary">当前去重账号</Text>
                          <div>
                            <Text strong>{outputInventory?.uniqueAccountCount ?? 0}</Text>
                          </div>
                        </Col>
                      </Row>
                    </Card>
                  </Space>
                </Card>
              </Col>

              <Col xs={24} xl={8}>
                <Card
                  title="输出目录状态"
                  extra={
                    <Space size={8}>
                      <Button size="small" icon={<DownloadOutlined />} onClick={handleDownloadOutputArchive} loading={busy}>
                        下载 ZIP
                      </Button>
                      <Button
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={handleClearOutputInventory}
                        loading={busy}
                      >
                        清空目录
                      </Button>
                    </Space>
                  }
                  className="strategy-card"
                >
                  <Space direction="vertical" size={16} style={{ width: "100%" }}>
                    <Row gutter={[12, 12]}>
                      <Col xs={24} sm={12} xl={24}>
                        <Card size="small">
                          <Statistic title="CPA 文件数" value={outputInventory?.cpa.fileCount ?? 0} />
                          <Text type="secondary">{outputInventory?.cpa.path ?? `${outputRootPath}\\cpa`}</Text>
                        </Card>
                      </Col>
                      <Col xs={24} sm={12} xl={24}>
                        <Card size="small">
                          <Statistic title="SubAPI 文件数" value={outputInventory?.subapi.fileCount ?? 0} />
                          <Text type="secondary">{outputInventory?.subapi.path ?? `${outputRootPath}\\subapi`}</Text>
                        </Card>
                      </Col>
                    </Row>
                    <div className="output-file-list">
                      <List
                        size="small"
                        locale={{ emptyText: "暂无账号文件记录" }}
                        dataSource={outputInventory?.recentFiles ?? []}
                        renderItem={(item) => (
                          <List.Item>
                            <Space direction="vertical" size={2} style={{ width: "100%" }}>
                              <Flex justify="space-between" align="center" gap={8}>
                                <Text strong ellipsis>
                                  {item.fileName}
                                </Text>
                                <Tag color={item.source === "cpa" ? "blue" : "green"}>{item.source.toUpperCase()}</Tag>
                              </Flex>
                              <Text type="secondary">
                                {item.accountKey} · {formatDateTime(item.updatedAt)} · {formatFileSize(item.size)}
                              </Text>
                            </Space>
                          </List.Item>
                        )}
                      />
                    </div>
                  </Space>
                </Card>
              </Col>
            </Row>

            <Drawer
              title="高级设置"
              width={520}
              open={drawerOpen}
              onClose={() => setDrawerOpen(false)}
              extra={
                <Button type="primary" onClick={handleSave} loading={busy}>
                  保存高级配置
                </Button>
              }
            >
              <Space direction="vertical" size={20} style={{ width: "100%" }}>
                <Card size="small" title="运行保护">
                  <Row gutter={12}>
                    <Col span={12}>
                      <Form.Item label="连续失败阈值" name="failureThreshold">
                        <InputNumber min={1} style={{ width: "100%" }} />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item label="冷却时长（秒）" name="cooldownSeconds">
                        <InputNumber min={1} style={{ width: "100%" }} />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item label="最小抖动秒数" name="loopJitterMinSeconds">
                        <InputNumber min={0} style={{ width: "100%" }} />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item label="最大抖动秒数" name="loopJitterMaxSeconds">
                        <InputNumber min={0} style={{ width: "100%" }} />
                      </Form.Item>
                    </Col>
                  </Row>
                </Card>

                <Card size="small" title="注册策略">
                  <Row gutter={12}>
                    <Col span={12}>
                      <Form.Item label="注册入口模式" name="entryMode">
                        <Select
                          options={[
                            { label: "chatgpt_web", value: "chatgpt_web" },
                            { label: "direct_auth", value: "direct_auth" },
                          ]}
                        />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item label="入口失败自动回退" name="entryModeFallback" valuePropName="checked">
                        <Switch />
                      </Form.Item>
                    </Col>
                  </Row>
                </Card>

                <Card size="small" title="OAuth 策略">
                  <Row gutter={12}>
                    <Col span={8}>
                      <Form.Item label="重试次数" name="oauthRetryAttempts">
                        <InputNumber min={0} style={{ width: "100%" }} />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item label="退避基数" name="oauthRetryBackoffBase">
                        <InputNumber min={0} style={{ width: "100%" }} />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item label="最大退避" name="oauthRetryBackoffMax">
                        <InputNumber min={0} style={{ width: "100%" }} />
                      </Form.Item>
                    </Col>
                  </Row>
                </Card>

                <Card size="small" title="输出设置">
                  <Alert
                    showIcon
                    type="info"
                    style={{ marginBottom: 12 }}
                    message="批量注册固定为本地保存"
                    description="按照当前规则，批量注册无论是否开启 access-only，都会将结果写入本地 output_tokens 目录，且不会自动上传到 CPA。"
                  />
                  <Form.Item
                    label="批量注册允许仅 access_token 成功"
                    name="batchAllowAccessTokenOnly"
                    valuePropName="checked"
                    style={{ marginBottom: 12 }}
                    extra="只影响批量注册，不影响补号维护。开启后如果注册阶段已拿到 access_token，就直接产出本地兼容增强版 JSON；批量注册本身始终只保存在本地，不会自动上传到 CPA。"
                  >
                    <Switch />
                  </Form.Item>
                  <Form.Item
                    label="循环补号允许仅 access_token 成功"
                    name="maintainerAllowAccessTokenOnly"
                    valuePropName="checked"
                    style={{ marginBottom: 12 }}
                    extra="只影响单次维护/循环补号。开启后，维护模式也可以在注册阶段拿到 access_token 后直接补充到 CPA，用来跳过后续可能命中的手机号校验。"
                  >
                    <Switch />
                  </Form.Item>
                  <Text type="secondary">
                    批量注册当前固定为本地保存。批量 access-only 当前为{watchedBatchAllowAccessTokenOnly ? "开启" : "关闭"}，开启后会默认使用兼容增强版 JSON 落到本地目录，便于你手动导入 CPA 或下载 ZIP，但不保证额度面板完整。
                  </Text>
                  <br />
                  <Text type="secondary">
                    维护模式 access-only 当前为{watchedMaintainerAllowAccessTokenOnly ? "开启" : "关闭"}。开启后循环补号也会采用同样的“跳过手机号”思路，并且仍可推送到 CPA，但不保证额度面板完整。
                  </Text>
                </Card>

                <Card size="small" title="访问安全">
                  <Space direction="vertical" size={12} style={{ width: "100%" }}>
                    <Input.Password
                      prefix={<LockOutlined />}
                      value={adminTokenDraft}
                      onChange={(event) => setAdminTokenDraft(event.target.value)}
                      placeholder="输入新的登录页密码"
                    />
                    <Input.Password
                      prefix={<LockOutlined />}
                      value={adminTokenConfirm}
                      onChange={(event) => setAdminTokenConfirm(event.target.value)}
                      placeholder="再次输入新的登录页密码"
                    />
                    <Flex justify="space-between" align="center" gap={12} wrap>
                      <Text type="secondary">保存后会立即替换当前管理令牌，后续登录请使用新密码。</Text>
                      <Button type="primary" onClick={handleUpdateAdminToken} loading={adminTokenBusy}>
                        更新登录页密码
                      </Button>
                    </Flex>
                  </Space>
                </Card>

                <Alert
                  showIcon
                  type="warning"
                  message="专家参数已收纳到抽屉中"
                  description="如 oauth.client_id、redirect_uri、瞬时错误关键词等底层工程参数，不建议在首页直接暴露。"
                />
              </Space>
            </Drawer>
            <Modal
              title="安装向导"
              open={setupGuideOpen}
              width={720}
              onCancel={handleCloseSetupGuide}
              footer={[
                <Button key="later" onClick={handleCloseSetupGuide}>
                  我先看看
                </Button>,
                <Button key="go-config" type="primary" onClick={handleOpenPrimaryConfig}>
                  从第一步开始
                </Button>,
              ]}
            >
              <Space direction="vertical" size={16} style={{ width: "100%" }}>
                <Alert
                  showIcon
                  type="warning"
                  message="检测到当前还没完成初始化配置"
                  description="这个向导只负责引导你定位到配置区，不会自动修改现有配置，也不会替你启动任何任务。"
                />
                <Steps
                  current={setupWizardCurrent}
                  direction="vertical"
                  className="setup-wizard-steps"
                  items={[
                    {
                      title: "第一步 配置 CPA",
                      status: cpaGuideItems.length > 0 ? "process" : "finish",
                      description: cpaGuideItems.length > 0 ? `待补 ${cpaGuideItems.length} 项关键参数` : "已完成，可读取账号池与清理接口",
                    },
                    {
                      title: "第二步 配置邮箱",
                      status: cpaGuideItems.length > 0 ? "wait" : mailGuideItems.length > 0 ? "process" : "finish",
                      description:
                        cpaGuideItems.length > 0
                          ? "请先完成 CPA 基础配置"
                          : mailGuideItems.length > 0
                            ? `待补 ${mailGuideItems.length} 项邮箱参数`
                            : "已完成，可创建邮箱并收取验证码",
                    },
                    {
                      title: "第三步 保存并开始维护",
                      status: prerequisitesReady ? "process" : "wait",
                      description: prerequisitesReady ? "现在可以保存配置，并手动选择单次维护或循环补号" : "等待前两步完成后再执行",
                    },
                  ]}
                />
                <Card size="small" className="setup-step-card">
                  <Flex justify="space-between" align="start" gap={12} wrap>
                    <Space direction="vertical" size={4}>
                      <Text strong>第一步 配置 CPA</Text>
                      <Text type="secondary">填写 CPA 地址和访问令牌，打通账号池读写能力。</Text>
                    </Space>
                    <Tag color={cpaGuideItems.length > 0 ? "warning" : "success"}>{cpaGuideItems.length > 0 ? "待配置" : "已完成"}</Tag>
                  </Flex>
                  <List
                    size="small"
                    dataSource={
                      cpaGuideItems.length > 0
                        ? cpaGuideItems
                        : [{ key: "cpa_done", title: "CPA 配置已完整", description: "当前已具备读取账号池、清理账号和发起维护任务的基础条件。" }]
                    }
                    renderItem={(item) => (
                      <List.Item>
                        <Space direction="vertical" size={2}>
                          <Text strong>{item.title}</Text>
                          <Text type="secondary">{item.description}</Text>
                        </Space>
                      </List.Item>
                    )}
                  />
                  <Button onClick={handleOpenPrimaryConfig}>前往核心配置</Button>
                </Card>
                <Card size="small" className="setup-step-card">
                  <Flex justify="space-between" align="start" gap={12} wrap>
                    <Space direction="vertical" size={4}>
                      <Text strong>第二步 配置邮箱</Text>
                      <Text type="secondary">根据你选择的 Provider 补齐邮箱 API、密钥和域名等参数。</Text>
                    </Space>
                    <Tag color={cpaGuideItems.length > 0 ? "default" : mailGuideItems.length > 0 ? "warning" : "success"}>
                      {cpaGuideItems.length > 0 ? "等待上一步" : mailGuideItems.length > 0 ? "待配置" : "已完成"}
                    </Tag>
                  </Flex>
                  <List
                    size="small"
                    dataSource={
                      mailGuideItems.length > 0
                        ? mailGuideItems
                        : [{ key: "mail_done", title: "邮箱配置已完整", description: "当前邮箱来源已具备创建邮箱和收取验证码的前置条件。" }]
                    }
                    renderItem={(item) => (
                      <List.Item>
                        <Space direction="vertical" size={2}>
                          <Text strong>{item.title}</Text>
                          <Text type="secondary">{item.description}</Text>
                        </Space>
                      </List.Item>
                    )}
                  />
                  <Button onClick={handleOpenMailConfig}>前往邮箱配置</Button>
                </Card>
                <Card size="small" className="setup-step-card">
                  <Flex justify="space-between" align="start" gap={12} wrap>
                    <Space direction="vertical" size={4}>
                      <Text strong>第三步 保存并开始维护</Text>
                      <Text type="secondary">完成前两步后，先保存配置，再从顶部操作区选择单次维护或循环补号。</Text>
                    </Space>
                    <Tag color={prerequisitesReady ? "processing" : "default"}>{prerequisitesReady ? "可执行" : "等待前置完成"}</Tag>
                  </Flex>
                  <List
                    size="small"
                    dataSource={[
                      { key: "save", title: "先点保存配置", description: "系统会先把当前表单写回后端配置文件。" },
                      { key: "single", title: "单次维护", description: "适合手动执行一轮清理与补号。" },
                      { key: "loop", title: "循环补号", description: "适合让系统自动巡检并持续维持账号池容量。" },
                    ]}
                    renderItem={(item) => (
                      <List.Item>
                        <Space direction="vertical" size={2}>
                          <Text strong>{item.title}</Text>
                          <Text type="secondary">{item.description}</Text>
                        </Space>
                      </List.Item>
                    )}
                  />
                  <Button type="primary" ghost onClick={handleOpenActionBar}>
                    查看顶部操作区
                  </Button>
                </Card>
              </Space>
            </Modal>
          </Form>
        </Content>
      </Layout>
    </ConfigProvider>
  );
}

export function App() {
  return (
    <AntdApp>
      <DashboardInner />
    </AntdApp>
  );
}
