from pathlib import Path
import re

p = Path('/Users/jackgong/.openclaw/workspace/refactor/全平台全自动写作业_登录系统_优化版.js')
s = p.read_text()

def replace_once(old, new, label):
    global s
    if old not in s:
        raise SystemExit(f'{label} not found')
    s = s.replace(old, new, 1)

replace_once(
'''const MEMBERSHIP_CONFIG = {
    apiBase: "https://membership.8188811.xyz/api",
    shareUrl: "https://membership.8188811.xyz/share/VoBJgMG8j7Qiog1jh3uRIhi7aCgkAFfZ",
    appCode: "IdBotAuto",
    appName: "ID写作业",
    appSecret: "qyItX3BF8i0-uOw_Ur-V5yzglDanp-b-0OXAL4GppqA",
    rechargeToken: ""
};''',
'''const MEMBERSHIP_CONFIG = {
    apiBase: "https://membership.8188811.xyz/api",
    shareUrl: "https://membership.8188811.xyz/share/VoBJgMG8j7Qiog1jh3uRIhi7aCgkAFfZ",
    appCode: "IDBot",
    appName: "IDBot",
    appSecret: "01xL99-xolszV5T_51eEjbkdxOb0PI8VWU0FvhZU6gw",
    rechargeToken: ""
};''',
'config')

replace_once(
'''var memberApiBase = MEMBERSHIP_CONFIG.apiBase;
var membershipShareUrl = MEMBERSHIP_CONFIG.shareUrl;
var membershipAppCode = MEMBERSHIP_CONFIG.appCode;
var membershipAppName = MEMBERSHIP_CONFIG.appName;
var membershipAppSecret = MEMBERSHIP_CONFIG.appSecret;
var membershipRechargeToken = MEMBERSHIP_CONFIG.rechargeToken;''',
'''var memberApiBase = MEMBERSHIP_CONFIG.apiBase;
var membershipWebBase = memberApiBase.replace(/\/api\/?$/, "");
var membershipShareUrl = MEMBERSHIP_CONFIG.shareUrl;
var membershipAppCode = MEMBERSHIP_CONFIG.appCode;
var membershipAppName = MEMBERSHIP_CONFIG.appName;
var membershipAppSecret = MEMBERSHIP_CONFIG.appSecret;
var membershipRechargeToken = MEMBERSHIP_CONFIG.rechargeToken;''',
'webbase')

replace_once(
'''    控件信息.memberExpireAt = 控件信息.memberExpireAt || "无";
    控件信息.账号 = 控件信息.账号 || "";
    控件信息.密码 = 控件信息.密码 || "";''',
'''    控件信息.memberExpireAt = 控件信息.memberExpireAt || "无";
    控件信息.memberAvailable = 控件信息.memberAvailable === true;
    控件信息.loginCaptchaEnabled = 控件信息.loginCaptchaEnabled === true;
    控件信息.账号 = 控件信息.账号 || "";
    控件信息.密码 = 控件信息.密码 || "";''',
'init_flags')

replace_once(
'''function 同步首页状态() {
    ui.无障碍 && (ui.无障碍.checked = auto.service != null);
    ui.悬浮窗 && (ui.悬浮窗.checked = floaty.checkPermission() != false);
    ui.打印日志 && (ui.打印日志.checked = 控件信息.打印日志 == true);
    刷新我的页面();
    刷新操作记录统计();
}''',
'''function 同步首页状态() {
    ui.无障碍 && (ui.无障碍.checked = auto.service != null);
    ui.悬浮窗 && (ui.悬浮窗.checked = floaty.checkPermission() != false);
    ui.打印日志 && (ui.打印日志.checked = 控件信息.打印日志 == true);
    刷新我的页面();
    刷新操作记录统计();
}

function 解析会员时间(value) {
    if (!value) return null;
    let ts = new Date(value).getTime();
    if (!isNaN(ts)) return ts;
    if (typeof value == "string") {
        ts = new Date(value.replace(" ", "T")).getTime();
        if (!isNaN(ts)) return ts;
    }
    return null;
}

function 获取当前App权益(entitlements) {
    entitlements = entitlements || [];
    for (let i = 0; i < entitlements.length; i++) {
        if (String(entitlements[i].app_code || "") == String(membershipAppCode)) {
            return entitlements[i];
        }
    }
    return null;
}

function 当前权益对象可用(entitlement) {
    if (!entitlement) return false;
    if (String(entitlement.status || "").toLowerCase() != "active") return false;
    if (!entitlement.expire_at) return true;
    let expireTs = 解析会员时间(entitlement.expire_at);
    if (!expireTs) return false;
    return expireTs > new Date().getTime();
}

function 当前App会员可用() {
    return 当前权益对象可用(获取当前App权益(控件信息.entitlements || []));
}

function 同步当前App会员信息(entitlements) {
    entitlements = entitlements || [];
    控件信息.entitlements = entitlements;
    控件信息.memberAvailable = false;
    重置会员信息();

    let currentEnt = 获取当前App权益(entitlements);
    if (!currentEnt) {
        控件信息.memberLevel = "未开通";
        控件信息.memberStatus = "inactive";
        控件信息.memberExpireAt = "无";
        return;
    }

    控件信息.memberStatus = currentEnt.status || "normal";
    控件信息.memberExpireAt = currentEnt.expire_at || "无";

    if (当前权益对象可用(currentEnt)) {
        控件信息.memberAvailable = true;
        控件信息.memberLevel = currentEnt.plan_name || currentEnt.plan_title || currentEnt.level_name || "会员";
        return;
    }

    if (currentEnt.expire_at && 解析会员时间(currentEnt.expire_at) && 解析会员时间(currentEnt.expire_at) <= new Date().getTime()) {
        控件信息.memberLevel = "已过期";
        控件信息.memberStatus = "expired";
    } else {
        控件信息.memberLevel = "未开通";
    }
}

function 获取公开配置() {
    try {
        let res = http.get(memberApiBase + "/admin/settings/public/config");
        if (res.statusCode != 200) return {};
        return JSON.parse(res.body.string()) || {};
    } catch (e) {
        console.log(e);
        return {};
    }
}

function 是否启用登录验证码() {
    let config = 获取公开配置();
    控件信息.loginCaptchaEnabled = !!config.login_captcha_enabled;
    保存控件信息();
    return 控件信息.loginCaptchaEnabled;
}

function 获取图形验证码() {
    try {
        let res = http.get(memberApiBase + "/auth/captcha");
        if (res.statusCode != 200) {
            toastLog("获取验证码失败: " + res.body.string());
            return null;
        }

        let data = JSON.parse(res.body.string()) || {};
        let imageBase64 = data.image_base64 || data.captcha_base64 || data.base64 || data.image || data.captcha_image || "";
        if (imageBase64 && imageBase64.indexOf("data:image") !== 0) {
            imageBase64 = "data:image/png;base64," + imageBase64;
        }

        if (!data.captcha_id || !imageBase64) {
            toastLog("验证码返回格式异常");
            return null;
        }

        return {
            captcha_id: data.captcha_id,
            image_base64: imageBase64
        };
    } catch (e) {
        console.log(e);
        toastLog("获取验证码异常: " + e);
        return null;
    }
}

function 渲染验证码到网页(webView, imageBase64) {
    let html = '<html><body style="margin:0;background:#ffffff;display:flex;align-items:center;justify-content:center;">'
        + '<img style="max-width:100%;height:auto;" src="' + imageBase64 + '" />'
        + '</body></html>';
    webView.loadDataWithBaseURL(null, html, "text/html", "utf-8", null);
}

function 显示登录验证码弹窗(emailOrUsername, password) {
    let captchaData = 获取图形验证码();
    if (!captchaData) return;

    ui.run(function () {
        let currentCaptcha = captchaData;
        let captchaView = ui.inflate(
            <vertical bg="#FFFFFF">
                <horizontal w="*" h="50dp" gravity="center_vertical" bg="#26b3c6" padding="12dp 0">
                    <text text="请输入验证码" textColor="#FFFFFF" textSize="18sp" textStyle="bold" marginLeft="16dp" layout_weight="1" />
                    <text id="关闭验证码页" text="关闭" textColor="#FFFFFF" textSize="16sp" marginRight="16dp" />
                </horizontal>
                <webview id="验证码网页" w="*" h="120dp" />
                <input id="验证码输入框" singleLine="true" hint="请输入图形验证码" textSize="18sp" margin="16dp 12dp" />
                <horizontal w="*" gravity="center" padding="12dp">
                    <card w="130dp" h="44dp" cardCornerRadius="22dp" cardBackgroundColor="#FFFFFF" cardElevation="0dp" marginRight="12dp">
                        <vertical id="刷新验证码" w="*" h="*" gravity="center">
                            <text text="刷新验证码" textColor="#26b3c6" textSize="15sp" textStyle="bold" />
                        </vertical>
                    </card>
                    <card w="150dp" h="44dp" cardCornerRadius="22dp" cardBackgroundColor="#26b3c6" cardElevation="0dp">
                        <vertical id="提交验证码登录" w="*" h="*" gravity="center">
                            <text text="确认登录" textColor="#FFFFFF" textSize="15sp" textStyle="bold" />
                        </vertical>
                    </card>
                </horizontal>
            </vertical>,
            null,
            false
        );

        let dialog = dialogs.build({
            customView: captchaView,
            wrapInScrollView: false,
            autoDismiss: false
        }).show();

        function refreshCaptchaView() {
            渲染验证码到网页(captchaView.验证码网页, currentCaptcha.image_base64);
        }

        refreshCaptchaView();

        captchaView.关闭验证码页.on("click", function () {
            dialog.dismiss();
        });

        captchaView.刷新验证码.on("click", function () {
            threads.start(function () {
                let nextCaptcha = 获取图形验证码();
                if (!nextCaptcha) return;
                currentCaptcha = nextCaptcha;
                ui.run(function () {
                    captchaView.验证码输入框.setText("");
                    refreshCaptchaView();
                });
            });
        });

        captchaView.提交验证码登录.on("click", function () {
            let captchaCode = String(captchaView.验证码输入框.getText()).trim();
            if (!captchaCode) {
                toastLog("请输入验证码");
                return;
            }

            threads.start(function () {
                let ok = 后端登录(emailOrUsername, password, {
                    captcha_id: currentCaptcha.captcha_id,
                    captcha_code: captchaCode
                });
                if (ok) {
                    ui.run(function () {
                        dialog.dismiss();
                        首页ui();
                    });
                }
            });
        });
    });
}

function 执行会员登录() {
    if (!控件信息.账号 || !控件信息.密码) {
        toastLog("请输入账号和密码");
        return;
    }

    toastLog("登录中...");
    if (是否启用登录验证码()) {
        显示登录验证码弹窗(控件信息.账号, 控件信息.密码);
        return;
    }

    threads.start(function () {
        let ok = 后端登录(控件信息.账号, 控件信息.密码);
        if (ok) {
            ui.run(function () {
                首页ui();
            });
        }
    });
}

function 获取当前App充值链接() {
    try {
        if (!控件信息.token) {
            toastLog("请先登录");
            return null;
        }

        let url = memberApiBase + "/recharge/by-app-name?app_name=" + encodeURIComponent(membershipAppName);
        let res = http.get(url, {
            headers: {
                "Authorization": "Bearer " + 控件信息.token
            }
        });

        if (res.statusCode != 200) {
            toastLog("获取充值链接失败: " + res.body.string());
            return null;
        }

        let data = JSON.parse(res.body.string()) || {};
        if (!data.token) {
            toastLog("未找到可用充值链接");
            return null;
        }
        return data;
    } catch (e) {
        console.error(e);
        toastLog("获取充值链接异常: " + e);
        return null;
    }
}''',
'helper_block')

replace_once(
'''    ui.登录.on("click", () => {
        控件信息.账号 = String(ui.账号.getText()).trim();
        控件信息.密码 = String(ui.密码.getText()).trim();
        保存控件信息();

        if (!控件信息.账号 || !控件信息.密码) {
            toastLog("请输入账号和密码");
            return;
        }

        toastLog("登录中...");
        threads.start(function () {
            let ok = 后端登录(控件信息.账号, 控件信息.密码);
            if (ok) {
                ui.run(function () {
                    首页ui();
                });
            }
        });
    });''',
'''    ui.登录.on("click", () => {
        控件信息.账号 = String(ui.账号.getText()).trim();
        控件信息.密码 = String(ui.密码.getText()).trim();
        保存控件信息();
        执行会员登录();
    });''',
'login_click')

replace_once(
'''function 后端登录(emailOrUsername, password) {
    try {
        let res = http.postJson(memberApiBase + "/auth/login", {
            "email_or_username": emailOrUsername,
            "password": password
        });''',
'''function 后端登录(emailOrUsername, password, loginExtra) {
    try {
        let loginPayload = {
            "email_or_username": emailOrUsername,
            "password": password
        };
        if (loginExtra && loginExtra.captcha_id) {
            loginPayload.captcha_id = loginExtra.captcha_id;
        }
        if (loginExtra && loginExtra.captcha_code) {
            loginPayload.captcha_code = loginExtra.captcha_code;
        }

        let res = http.postJson(memberApiBase + "/auth/login", loginPayload);''',
'login_signature')

replace_once(
'''        let ok = 获取我的信息();
        if (!ok) {
            toastLog("登录成功，但获取用户信息失败");
            return false;
        }

        toastLog("登录成功");
        return true;''',
'''        let ok = 获取我的信息();
        if (!ok) {
            toastLog("登录成功，但获取用户信息失败");
            return false;
        }

        if (当前App会员可用()) {
            toastLog("登录成功");
        } else {
            toastLog("登录成功，但当前 App 会员未开通或已过期，请先充值");
        }
        return true;''',
'login_success')

replace_once(
'''        if (entRes.statusCode == 200) {
            let ents = JSON.parse(entRes.body.string()) || [];
            控件信息.entitlements = ents;

            let currentEnt = null;
            for (let i = 0; i < ents.length; i++) {
                if (ents[i].app_code == membershipAppCode) {
                    currentEnt = ents[i];
                    break;
                }
            }

            if (currentEnt) {
                if (currentEnt.status == "active") {
                    控件信息.memberLevel = "体验会员";
                    控件信息.memberStatus = "active";
                    控件信息.memberExpireAt = currentEnt.expire_at || "无";
                } else {
                    控件信息.memberLevel = "普通会员";
                    控件信息.memberStatus = currentEnt.status || "normal";
                    控件信息.memberExpireAt = currentEnt.expire_at || "无";
                }
            }
        } else {
            控件信息.entitlements = [];
        }''',
'''        if (entRes.statusCode == 200) {
            let ents = JSON.parse(entRes.body.string()) || [];
            同步当前App会员信息(ents);
        } else {
            同步当前App会员信息([]);
        }''',
'entitlement_logic')

replace_once(
'''    ui.运行.click(() => {
        toastLog("开始运行");
        ui控件存储();
        if (!权限检测({ 悬浮窗: true, 无障碍: true })) { return; }

        if (!控件信息.私信用户_box && !控件信息.发送图片_box) {''',
'''    ui.运行.click(() => {
        toastLog("开始运行");
        ui控件存储();
        if (!权限检测({ 悬浮窗: true, 无障碍: true })) { return; }

        if (!当前App会员可用()) {
            alert("会员提示", "当前账号未开通或已过期，无法运行任务，请先前往充值。"); return false;
        }

        if (!控件信息.私信用户_box && !控件信息.发送图片_box) {''',
'run_guard')

replace_once(
'''function 获取当前App充值Token() {
    if (membershipRechargeToken && membershipRechargeToken != "这里替换成_IdBotAuto_对应的_recharge_token") {
        return membershipRechargeToken;
    }
    toastLog("未配置充值 token，请在 MEMBERSHIP_CONFIG.rechargeToken 中补充 IdBotAuto 对应的 recharge_token");
    return null;
}''',
'''function 获取当前App充值Token() {
    if (membershipRechargeToken && membershipRechargeToken != "这里替换成_IdBotAuto_对应的_recharge_token") {
        return membershipRechargeToken;
    }

    let rechargeLink = 获取当前App充值链接();
    if (rechargeLink && rechargeLink.token) {
        return rechargeLink.token;
    }

    toastLog("未找到可用充值链接，请先在会员后台为 " + membershipAppName + " 配置 active 充值链接");
    return null;
}''',
'recharge_token')

replace_once(
'''        let iframeUrl = "https://membership.8188811.xyz" + (ticketData.consume_url || ("/sso/consume?ticket=" + encodeURIComponent(ticketData.ticket)));''',
'''        let iframeUrl = membershipWebBase + (ticketData.consume_url || ("/sso/consume?ticket=" + encodeURIComponent(ticketData.ticket)));''',
'iframe_url')

# small cleanup: if register shareUrl missing, guard in function
replace_once(
'''function 打开注册弹窗() {
    ui.run(function () {''',
'''function 打开注册弹窗() {
    if (!membershipShareUrl) {
        toastLog("未配置分享注册链接，请先设置 MEMBERSHIP_CONFIG.shareUrl");
        return;
    }
    ui.run(function () {''',
'register_guard')

# normalize blank lines
s = re.sub(r'\n{3,}', '\n\n', s)
p.write_text(s)
print('patched', p)
