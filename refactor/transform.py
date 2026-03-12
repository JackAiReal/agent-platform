from pathlib import Path
import re

p = Path('/Users/jackgong/.openclaw/workspace/refactor/source.js')
s = p.read_text()

def replace_once(src, old, new, label):
    if old not in src:
        raise SystemExit(f'{label} not found')
    return src.replace(old, new, 1)

old_header = ''''ui';
javaClass(); public(); UI_layout_module(); foundation();
ui.statusBarColor("#ff0033");




// 你的 app_code，按文档配置
var membershipAppCode = "AiceMind"; // 改成你的真实 app_code

var 脚本名称 = '全平台全自动写作业';
const 当前版本号 = '2.0.5';
const 悬浮窗启动方式 = 0;
/* 获取屏幕信息 */
const resources = context.getResources();
let 屏幕信息 = resources.getDisplayMetrics();
const 设备高度 = Math.floor((device.height || 屏幕信息.heightPixels || 1920) / 10) * 10;
const 设备宽度 = Math.floor((device.width || 屏幕信息.widthPixels || 1080) / 10) * 10;
const toast监控 = { 是否开启: false, toast内容: null };
var height = device.height
var width = device.width

var storage = storages.create("auto" + 脚本名称), 内容;
// storage.clear()
var dateStorage = storages.create(getCurrentDate() + 脚本名称), 内容;

var cache = storageNullCreate(dateStorage, "cache", [])
var page = storageNullCreate(dateStorage, "page", 1)
var page_size = storageNullCreate(dateStorage, "page_size", 100)

var long_cache = storageNullCreate(storage, "long_cache", [])
// page_size = 1
var 控件信息 = storage.get("控件存储");
控件信息 = 控件信息 || {};
控件信息.操作记录list = 控件信息.操作记录list || [];
控件信息.已获取number = 0;
console.log(控件信息);

// ===== Membership 配置 =====
var memberApiBase = "https://membership.8188811.xyz/api";
var membershipShareUrl = "https://membership.8188811.xyz/share/VoBJgMG8j7Qiog1jh3uRIhi7aCgkAFfZ";

// 你新建的 App
var membershipAppCode = "IdBotAuto";
var membershipAppName = "ID写作业";
var membershipAppSecret = "qyItX3BF8i0-uOw_Ur-V5yzglDanp-b-0OXAL4GppqA";

// 登录态缓存
控件信息.token = 控件信息.token || "";
控件信息.refresh_token = 控件信息.refresh_token || "";
控件信息.userInfo = 控件信息.userInfo || null;
控件信息.entitlements = 控件信息.entitlements || [];
控件信息.memberLevel = 控件信息.memberLevel || "普通会员";
控件信息.memberStatus = 控件信息.memberStatus || "normal";
控件信息.memberExpireAt = 控件信息.memberExpireAt || "无";
控件信息.账号 = 控件信息.账号 || "";
控件信息.密码 = 控件信息.密码 || "";


var aimStr = "蓝伴语音|咪鸭|哆咪|cucu|喜马拉雅|梦音|花椒|捞月狗|双鱼|伴糖|多多|kook|PP|不夜|不二开黑|keke|gugu|咕咕|atat|双鱼|cucu|uki|小陪伴|Dino|更多App兼容中..."
var aimNum = aimStr.split("|").length

var uiStorage = storages.create("ui");
// uiStorage.clear()
var platForms = storageNullCreateui(uiStorage, "platForms", aimStr)
function storageNullCreateui(appStorage, key, defaultValue) {
    if ((appStorage.get(key) + '') === "undefined") {
        appStorage.put(key, defaultValue)
        return defaultValue
    }
    else if (appStorage.get(key).length !== aimStr.length) {
        appStorage.put(key, defaultValue)
        return defaultValue
    }
    else {
        console.log(appStorage.get(key))
        if (appStorage.get(key).split("|").length == aimNum) {
            return appStorage.get(key)
        } else {
            appStorage.put(key, aimStr)
            return aimStr
        }

    }
}

var kg;
var 主程序线程 = threads.start(function () { });
var 悬浮窗线程 = threads.start(function () { });
events.on("exit", function () {
    storage.put("控件存储", 控件信息);
});

var baseUrl = "https://api.8188811.xyz"
var codeType = "AllIdTask"
var idType = "page_data_9"
var apkPackage = "com.jiuyin.mc"
var appVersion = "1.6.51"
var fullIdPre = "com.jiuyin.mc:id/"
var androidId = device.getAndroidId()
var within = 24 * 3600
var actionSpeed = 800
var maxImages = 5
var isCheckedLocal = false

var isFirstEnter
var codeStorage

var RrstartStatus = "初始化"
var checkThreads = null
let 更新公告 = "V" + 当前版本号 + "更新: 1.添加自动重启修复，无惧自动退出"


let 滚动公告 = '本软件仅供学习和研究使用。其旨在为技术交流讨论提供参考和资料，任何其他目的均不适用，如若违反相关条例法律, 一切后果由使用者承担, 继续使用代表您同意本条款!。本免责声明的最终解释权归声明者所有。';
'''

new_header = ''''ui';
javaClass(); public(); UI_layout_module(); foundation();
ui.statusBarColor("#ff0033");

var 脚本名称 = '全平台全自动写作业';
const 当前版本号 = '2.0.5';
const 悬浮窗启动方式 = 0;

const MEMBERSHIP_CONFIG = {
    apiBase: "https://membership.8188811.xyz/api",
    shareUrl: "https://membership.8188811.xyz/share/VoBJgMG8j7Qiog1jh3uRIhi7aCgkAFfZ",
    appCode: "IdBotAuto",
    appName: "ID写作业",
    appSecret: "qyItX3BF8i0-uOw_Ur-V5yzglDanp-b-0OXAL4GppqA",
    rechargeToken: ""
};

const TASK_CONFIG = {
    baseUrl: "https://api.8188811.xyz",
    codeType: "AllIdTask",
    defaultIdType: "page_data_9",
    defaultPackage: "com.jiuyin.mc",
    defaultVersion: "1.6.51",
    defaultIdPrefix: "com.jiuyin.mc:id/",
    withinSeconds: 24 * 3600,
    defaultPageSize: 100,
    maxImages: 5
};

/* 获取屏幕信息 */
const resources = context.getResources();
let 屏幕信息 = resources.getDisplayMetrics();
const 设备高度 = Math.floor((device.height || 屏幕信息.heightPixels || 1920) / 10) * 10;
const 设备宽度 = Math.floor((device.width || 屏幕信息.widthPixels || 1080) / 10) * 10;
const toast监控 = { 是否开启: false, toast内容: null };
var height = device.height
var width = device.width

var memberApiBase = MEMBERSHIP_CONFIG.apiBase;
var membershipShareUrl = MEMBERSHIP_CONFIG.shareUrl;
var membershipAppCode = MEMBERSHIP_CONFIG.appCode;
var membershipAppName = MEMBERSHIP_CONFIG.appName;
var membershipAppSecret = MEMBERSHIP_CONFIG.appSecret;
var membershipRechargeToken = MEMBERSHIP_CONFIG.rechargeToken;

var baseUrl = TASK_CONFIG.baseUrl
var codeType = TASK_CONFIG.codeType
var idType = TASK_CONFIG.defaultIdType
var apkPackage = TASK_CONFIG.defaultPackage
var appVersion = TASK_CONFIG.defaultVersion
var fullIdPre = TASK_CONFIG.defaultIdPrefix
var androidId = device.getAndroidId()
var within = TASK_CONFIG.withinSeconds
var actionSpeed = 800
var maxImages = TASK_CONFIG.maxImages
var isCheckedLocal = false

var storage = storages.create("auto" + 脚本名称);
var dateStorage = storages.create(getCurrentDate() + 脚本名称);

var cache = storageNullCreate(dateStorage, "cache", [])
var page = storageNullCreate(dateStorage, "page", 1)
var page_size = storageNullCreate(dateStorage, "page_size", TASK_CONFIG.defaultPageSize)
var long_cache = storageNullCreate(storage, "long_cache", [])

var 控件信息 = storage.get("控件存储") || {};
初始化控件信息();
console.log(控件信息);

var aimStr = "蓝伴语音|咪鸭|哆咪|cucu|喜马拉雅|梦音|花椒|捞月狗|双鱼|伴糖|多多|kook|PP|不夜|不二开黑|keke|gugu|咕咕|atat|双鱼|cucu|uki|小陪伴|Dino|更多App兼容中..."
var aimNum = aimStr.split("|").length

var uiStorage = storages.create("ui");
var platForms = storageNullCreateui(uiStorage, "platForms", aimStr)
function storageNullCreateui(appStorage, key, defaultValue) {
    let currentValue = appStorage.get(key);
    if ((currentValue + '') === "undefined" || !currentValue) {
        appStorage.put(key, defaultValue)
        return defaultValue
    }
    if (currentValue.length !== aimStr.length || currentValue.split("|").length != aimNum) {
        appStorage.put(key, aimStr)
        return aimStr
    }
    console.log(currentValue)
    return currentValue
}

var 主程序线程 = threads.start(function () { });
var 悬浮窗线程 = threads.start(function () { });
var isFirstEnter
var codeStorage
var RrstartStatus = "初始化"
var checkThreads = null
let 更新公告 = "V" + 当前版本号 + "更新: 1.添加自动重启修复，无惧自动退出"
let 滚动公告 = '本软件仅供学习和研究使用。其旨在为技术交流讨论提供参考和资料，任何其他目的均不适用，如若违反相关条例法律, 一切后果由使用者承担, 继续使用代表您同意本条款!。本免责声明的最终解释权归声明者所有。';

events.on("exit", function () {
    保存控件信息();
});

function 初始化控件信息() {
    控件信息.操作记录list = 控件信息.操作记录list || [];
    控件信息.已获取number = 控件信息.已获取number || 0;
    控件信息.token = 控件信息.token || "";
    控件信息.refresh_token = 控件信息.refresh_token || "";
    控件信息.userInfo = 控件信息.userInfo || null;
    控件信息.entitlements = 控件信息.entitlements || [];
    控件信息.memberLevel = 控件信息.memberLevel || "普通会员";
    控件信息.memberStatus = 控件信息.memberStatus || "normal";
    控件信息.memberExpireAt = 控件信息.memberExpireAt || "无";
    控件信息.账号 = 控件信息.账号 || "";
    控件信息.密码 = 控件信息.密码 || "";
}

function 保存控件信息() {
    storage.put("控件存储", 控件信息);
}

function 重置会员信息() {
    控件信息.memberLevel = "普通会员";
    控件信息.memberStatus = "normal";
    控件信息.memberExpireAt = "无";
}

function 配置内嵌网页(webView, 页面名称) {
    let ws = webView.getSettings();
    ws.setJavaScriptEnabled(true);
    ws.setDomStorageEnabled(true);
    ws.setUseWideViewPort(true);
    ws.setLoadWithOverviewMode(true);
    ws.setSupportZoom(false);
    ws.setBuiltInZoomControls(false);
    ws.setDisplayZoomControls(false);
    ws.setAllowFileAccess(true);
    ws.setDatabaseEnabled(true);
    ws.setCacheMode(android.webkit.WebSettings.LOAD_DEFAULT);

    webView.setWebViewClient(new JavaAdapter(android.webkit.WebViewClient, {
        onPageFinished: function (view, url) {
            log(页面名称 + "加载完成: " + url);
        },
        shouldOverrideUrlLoading: function (view, url) {
            view.loadUrl(url);
            return true;
        }
    }));
}

function 刷新操作记录统计() {
    if (!ui.操作记录list) return;
    ui.操作记录list.setDataSource(控件信息.操作记录list || []);

    let 添加数据 = 控件信息.操作记录list.filter((Value2) => Value2.添加);
    let 私信数据 = 控件信息.操作记录list.filter((Value2) => Value2.私信);
    let 拨打数据 = 控件信息.操作记录list.filter((Value2) => Value2.拨打);

    ui.私信记录 && ui.私信记录.setText("私信:" + String(私信数据.length));
    ui.添加记录 && ui.添加记录.setText("添加:" + String(添加数据.length));
    ui.拨打记录 && ui.拨打记录.setText("拨打:" + String(拨打数据.length));
}

function 同步首页状态() {
    ui.无障碍 && (ui.无障碍.checked = auto.service != null);
    ui.悬浮窗 && (ui.悬浮窗.checked = floaty.checkPermission() != false);
    ui.打印日志 && (ui.打印日志.checked = 控件信息.打印日志 == true);
    刷新我的页面();
    刷新操作记录统计();
}
'''

s = replace_once(s, old_header, new_header, 'header')

# save helper replacements
s = s.replace('storage.put("控件存储", 控件信息);', '保存控件信息();')

old_register_web = '''        ui.run(function () {
            let ws = webView.getSettings();
            ws.setJavaScriptEnabled(true);
            ws.setDomStorageEnabled(true);
            ws.setUseWideViewPort(true);
            ws.setLoadWithOverviewMode(true);
            ws.setSupportZoom(false);
            ws.setBuiltInZoomControls(false);
            ws.setDisplayZoomControls(false);
            ws.setAllowFileAccess(true);
            ws.setDatabaseEnabled(true);
            ws.setCacheMode(android.webkit.WebSettings.LOAD_DEFAULT);
        });

        webView.setWebViewClient(new JavaAdapter(android.webkit.WebViewClient, {
            onPageFinished: function (view, url) {
                log("注册页加载完成: " + url);
            },
            shouldOverrideUrlLoading: function (view, url) {
                view.loadUrl(url);
                return true;
            }
        }));

        webView.loadUrl(membershipShareUrl);
'''
new_register_web = '''        ui.run(function () {
            配置内嵌网页(webView, "注册页");
            webView.loadUrl(membershipShareUrl);
        });
'''
s = replace_once(s, old_register_web, new_register_web, 'register_web')

old_recharge_web = '''            let webView = rechargeView.充值网页;
            let ws = webView.getSettings();

            ws.setJavaScriptEnabled(true);
            ws.setDomStorageEnabled(true);
            ws.setUseWideViewPort(true);
            ws.setLoadWithOverviewMode(true);
            ws.setSupportZoom(false);
            ws.setBuiltInZoomControls(false);
            ws.setDisplayZoomControls(false);
            ws.setAllowFileAccess(true);
            ws.setDatabaseEnabled(true);
            ws.setCacheMode(android.webkit.WebSettings.LOAD_DEFAULT);

            webView.setWebViewClient(new JavaAdapter(android.webkit.WebViewClient, {
                onPageFinished: function (view, url) {
                    log("充值页加载完成: " + url);
                },
                shouldOverrideUrlLoading: function (view, url) {
                    view.loadUrl(url);
                    return true;
                }
            }));

            webView.loadUrl(iframeUrl);
'''
new_recharge_web = '''            let webView = rechargeView.充值网页;
            配置内嵌网页(webView, "充值页");
            webView.loadUrl(iframeUrl);
'''
s = replace_once(s, old_recharge_web, new_recharge_web, 'recharge_web')

s = replace_once(s,
'''        // 默认先给普通会员
        控件信息.memberLevel = "普通会员";
        控件信息.memberStatus = "normal";
        控件信息.memberExpireAt = "无";
''',
'''        // 默认先给普通会员
        重置会员信息();
''',
'reset_member')

old_stats = '''    let 添加数据 = 控件信息.操作记录list.filter((Value2) => {
        return Value2.添加;
    });
    let 私信数据 = 控件信息.操作记录list.filter((Value2) => {
        return Value2.私信;
    });

    let 拨打数据 = 控件信息.操作记录list.filter((Value2) => {
        return Value2.拨打;
    });
    let 发图数据 = 控件信息.操作记录list.filter((Value2) => {
        return Value2.发图;
    });

    ui.私信记录.setText("私信:" + String(私信数据.length));
    ui.添加记录.setText("添加:" + String(添加数据.length));
    ui.拨打记录.setText("拨打:" + String(拨打数据.length));
'''
new_stats = '    刷新操作记录统计();\n'
s = replace_once(s, old_stats, new_stats, 'home_stats')

old_resume = '''ui.emitter.on("resume", function () {
        ui.无障碍.checked = auto.service != null;
        ui.悬浮窗.checked = floaty.checkPermission() != false;
        ui.打印日志.checked = 控件信息.打印日志 == true;
        刷新我的页面();
    });

    ui.emitter.on("resume", function () {
        ui.无障碍.checked = auto.service != null;
        ui.悬浮窗.checked = floaty.checkPermission() != false;
        ui.打印日志.checked = 控件信息.打印日志 == true;
        ui.操作记录list.setDataSource(控件信息.操作记录list || []);
        let 添加数据 = 控件信息.操作记录list.filter((Value2) => {
            return Value2.添加;
        });
        let 私信数据 = 控件信息.操作记录list.filter((Value2) => {
            return Value2.私信;
        });

        let 拨打数据 = 控件信息.操作记录list.filter((Value2) => {
            return Value2.拨打;
        });

        ui.私信记录.setText("私信:" + String(私信数据.length));
        ui.添加记录.setText("添加:" + String(添加数据.length));
        ui.拨打记录.setText("拨打:" + String(拨打数据.length));
    });
'''
new_resume = '''    ui.emitter.on("resume", function () {
        同步首页状态();
    });
'''
s = replace_once(s, old_resume, new_resume, 'resume_block')

old_clear = '''ui.清除记录.on("click", function () {
        控件信息.操作记录list = [];
        let 添加数据 = 控件信息.操作记录list.filter((Value2) => {
            return Value2.添加;
        });
        let 私信数据 = 控件信息.操作记录list.filter((Value2) => {
            return Value2.私信;
        });
        ui.私信记录.setText("私信:" + String(私信数据.length));
        ui.添加记录.setText("添加:" + String(添加数据.length));
        ui.操作记录list.setDataSource(控件信息.操作记录list || []);
        toastLog("清除成功");
    });
'''
new_clear = '''    ui.清除记录.on("click", function () {
        控件信息.操作记录list = [];
        刷新操作记录统计();
        toastLog("清除成功");
    });
'''
s = replace_once(s, old_clear, new_clear, 'clear_block')

s = replace_once(s,
'''function 获取当前App充值Token() {
    if (membershipRechargeToken && membershipRechargeToken != "这里替换成_IdBotAuto_对应的_recharge_token") {
        return membershipRechargeToken;
    }
    toastLog("未配置充值 token，请补充 IdBotAuto 对应的 recharge_token");
    return null;
}
''',
'''function 获取当前App充值Token() {
    if (membershipRechargeToken && membershipRechargeToken != "这里替换成_IdBotAuto_对应的_recharge_token") {
        return membershipRechargeToken;
    }
    toastLog("未配置充值 token，请在 MEMBERSHIP_CONFIG.rechargeToken 中补充 IdBotAuto 对应的 recharge_token");
    return null;
}
''',
'recharge_token_msg')

s = replace_once(s,
'''function threadRunOne2(callback, one) {
    let res
    let threada = threads.start(function () {
        res = callback(one)
    }).join()
    return res
}
''',
'''function threadRunOne2(callback, one) {
    let res
    let threada = threads.start(function () {
        res = callback(one)
    })
    threada.join()
    return res
}
''',
'threadRunOne2')

s = s.replace('\n// uiStorage.clear()', '')
s = s.replace('\n// 首页ui()', '')
s = re.sub(r'\n{3,}', '\n\n', s)

out = Path('/Users/jackgong/.openclaw/workspace/refactor/全平台全自动写作业_登录系统_优化版.js')
out.write_text(s)
print(out)
print('lines', s.count('\n') + 1)
