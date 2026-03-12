from pathlib import Path
import re
p=Path('/Users/jackgong/.openclaw/workspace/refactor/全平台全自动写作业_登录系统_优化版.js')
s=p.read_text()

def replace_once(old,new,label):
    global s
    if old not in s:
        raise SystemExit(f'{label} not found')
    s=s.replace(old,new,1)

replace_once(
'''function 保存控件信息() {
    storage.put("控件存储", 控件信息);
}

function 重置会员信息() {
    控件信息.memberLevel = "普通会员";
    控件信息.memberStatus = "normal";
    控件信息.memberExpireAt = "无";
}''',
'''function 保存控件信息() {
    storage.put("控件存储", 控件信息);
}

function 记录关键日志(tag, payload) {
    let text = "[Membership][" + tag + "] ";
    if (typeof payload == "string") {
        text += payload;
    } else {
        try {
            text += JSON.stringify(payload);
        } catch (e) {
            text += String(payload);
        }
    }
    console.log(text);
    try {
        if (控件信息 && 控件信息.打印日志) {
            myConsole(text);
        }
    } catch (e) {}
}

function 格式化时间显示(value) {
    let ts = 解析会员时间(value);
    if (!ts) return value || "无";
    let d = new Date(ts);
    function pad(n) { return String(n).padStart(2, '0'); }
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
}

function 规范化匹配值(value) {
    return String(value || "").replace(/\s+/g, "").toLowerCase();
}

function 获取使用教程文本() {
    return [
        "使用教程（临时文本版）",
        "",
        "1. 先登录会员账号，确认个人信息页里的会员类型正常显示。",
        "2. 打开运行设置，选择平台、功能、话术库、本地ID库。",
        "3. 必须开启无障碍权限、悬浮窗权限。",
        "4. 点击底部运行按钮开始执行。",
        "5. 如果提示会员未开通，请点击立即充值，完成支付后关闭充值页并刷新会员信息。",
        "6. 如果充值成功但会员仍未生效，查看日志里 Membership 相关输出。",
        "",
        "后续这里可以替换成正式教程页面。"
    ].join("\n");
}

function 重置会员信息() {
    控件信息.memberLevel = "普通会员";
    控件信息.memberStatus = "normal";
    控件信息.memberExpireAt = "无";
}''',
'helpers')

replace_once(
'''function 获取当前App权益(entitlements) {
    entitlements = entitlements || [];
    for (let i = 0; i < entitlements.length; i++) {
        if (String(entitlements[i].app_code || "") == String(membershipAppCode)) {
            return entitlements[i];
        }
    }
    return null;
}''',
'''function 获取当前App权益(entitlements) {
    entitlements = entitlements || [];
    let targetCode = 规范化匹配值(membershipAppCode);
    let targetName = 规范化匹配值(membershipAppName);

    for (let i = 0; i < entitlements.length; i++) {
        let item = entitlements[i] || {};
        if (规范化匹配值(item.app_code) == targetCode) {
            return item;
        }
    }

    for (let i = 0; i < entitlements.length; i++) {
        let item = entitlements[i] || {};
        if (规范化匹配值(item.app_name) == targetName) {
            return item;
        }
    }

    return null;
}''',
'match_entitlement')

replace_once(
'''function 同步当前App会员信息(entitlements) {
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
}''',
'''function 同步当前App会员信息(entitlements) {
    entitlements = entitlements || [];
    控件信息.entitlements = entitlements;
    控件信息.memberAvailable = false;
    重置会员信息();

    记录关键日志("entitlements.raw", entitlements);
    let currentEnt = 获取当前App权益(entitlements);
    记录关键日志("entitlements.match", currentEnt || "未匹配到当前 App 权益");

    if (!currentEnt) {
        控件信息.memberLevel = "未开通";
        控件信息.memberStatus = "inactive";
        控件信息.memberExpireAt = "无";
        return;
    }

    控件信息.memberStatus = currentEnt.status || "normal";
    控件信息.memberExpireAt = 格式化时间显示(currentEnt.expire_at || "无");

    if (当前权益对象可用(currentEnt)) {
        控件信息.memberAvailable = true;
        控件信息.memberLevel = currentEnt.plan_name || currentEnt.plan_title || currentEnt.level_name || "会员";
        记录关键日志("entitlements.available", {
            memberLevel: 控件信息.memberLevel,
            memberStatus: 控件信息.memberStatus,
            expireAt: 控件信息.memberExpireAt
        });
        return;
    }

    if (currentEnt.expire_at && 解析会员时间(currentEnt.expire_at) && 解析会员时间(currentEnt.expire_at) <= new Date().getTime()) {
        控件信息.memberLevel = "已过期";
        控件信息.memberStatus = "expired";
    } else {
        控件信息.memberLevel = "未开通";
    }

    记录关键日志("entitlements.unavailable", {
        memberLevel: 控件信息.memberLevel,
        memberStatus: 控件信息.memberStatus,
        expireAt: 控件信息.memberExpireAt
    });
}''',
'sync_member')

replace_once(
'''function 加载使用教程页面() {
    if (!ui.使用教程网页) return;
    配置内嵌网页(ui.使用教程网页, "使用教程");
    ui.使用教程网页.loadUrl("https://www.baidu.com");
}''',
'''function 加载使用教程页面() {
    if (ui.使用教程文本) {
        ui.使用教程文本.setText(获取使用教程文本());
    }
}''',
'tutorial_loader')

replace_once(
'''        let res = http.postJson(memberApiBase + "/auth/login", loginPayload);''',
'''        记录关键日志("auth.login.request", {
            account: emailOrUsername,
            hasCaptchaId: !!loginPayload.captcha_id,
            hasCaptchaCode: !!loginPayload.captcha_code
        });
        let res = http.postJson(memberApiBase + "/auth/login", loginPayload);''',
'login_req')

replace_once(
'''        let data = JSON.parse(res.body.string());''',
'''        let data = JSON.parse(res.body.string());
        记录关键日志("auth.login.response", { statusCode: res.statusCode, hasAccessToken: !!data.access_token });''',
'login_resp')

replace_once(
'''        let meRes = http.get(memberApiBase + "/auth/me", {
            headers: {
                "Authorization": "Bearer " + 控件信息.token
            }
        });''',
'''        let meRes = http.get(memberApiBase + "/auth/me", {
            headers: {
                "Authorization": "Bearer " + 控件信息.token
            }
        });
        记录关键日志("auth.me.response", { statusCode: meRes.statusCode, body: meRes.body.string() });
        meRes = http.get(memberApiBase + "/auth/me", {
            headers: {
                "Authorization": "Bearer " + 控件信息.token
            }
        });''',
'me_log')

replace_once(
'''        let entRes = http.get(memberApiBase + "/entitlements/me", {
            headers: {
                "Authorization": "Bearer " + 控件信息.token
            }
        });''',
'''        let entRes = http.get(memberApiBase + "/entitlements/me", {
            headers: {
                "Authorization": "Bearer " + 控件信息.token
            }
        });
        记录关键日志("entitlements.response", { statusCode: entRes.statusCode, body: entRes.body.string() });
        entRes = http.get(memberApiBase + "/entitlements/me", {
            headers: {
                "Authorization": "Bearer " + 控件信息.token
            }
        });''',
'ent_log')

replace_once(
'''function 创建充值SSOTicket(rechargeToken) {
    try {
        if (!控件信息.token) {
            toastLog("请先登录");
            return null;
        }

        let url = memberApiBase + "/sso/ticket";''',
'''function 创建充值SSOTicket(rechargeToken) {
    try {
        if (!控件信息.token) {
            toastLog("请先登录");
            return null;
        }

        let url = memberApiBase + "/sso/ticket";
        记录关键日志("recharge.sso.request", {
            url: url,
            recharge_token: rechargeToken,
            source_app_code: membershipAppCode
        });''',
'sso_req')

replace_once(
'''        let data = JSON.parse(res.body.string());
        if (!data.ticket) {''',
'''        let data = JSON.parse(res.body.string());
        记录关键日志("recharge.sso.response", { statusCode: res.statusCode, body: data });
        if (!data.ticket) {''',
'sso_resp')

replace_once(
'''function 获取当前App充值链接() {
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
'''function 获取当前App充值链接() {
    try {
        if (!控件信息.token) {
            toastLog("请先登录");
            return null;
        }

        let url = memberApiBase + "/recharge/by-app-name?app_name=" + encodeURIComponent(membershipAppName);
        记录关键日志("recharge.link.request", { url: url, appName: membershipAppName, appCode: membershipAppCode });
        let res = http.get(url, {
            headers: {
                "Authorization": "Bearer " + 控件信息.token
            }
        });

        let rawBody = res.body.string();
        记录关键日志("recharge.link.response", { statusCode: res.statusCode, body: rawBody });
        if (res.statusCode != 200) {
            return null;
        }

        let data = JSON.parse(rawBody) || {};
        if (!data.token) {
            记录关键日志("recharge.link.empty", data);
            return null;
        }
        return data;
    } catch (e) {
        console.error(e);
        记录关键日志("recharge.link.error", String(e));
        return null;
    }
}''',
'recharge_link')

replace_once(
'''function 获取当前App充值Token() {
    let rechargeLink = 获取当前App充值链接();
    if (rechargeLink && rechargeLink.token) {
        return rechargeLink.token;
    }

    if (membershipRechargeToken && membershipRechargeToken != "这里替换成_IdBotAuto_对应的_recharge_token") {
        toastLog("接口未查到充值链接，已自动回退到本地配置的 recharge token");
        return membershipRechargeToken;
    }

    toastLog("未找到可用充值链接，请先在会员后台为 " + membershipAppName + " 配置 active 充值链接");
    return null;
}''',
'''function 获取当前App充值Token() {
    let rechargeLink = 获取当前App充值链接();
    if (rechargeLink && rechargeLink.token) {
        记录关键日志("recharge.link.useRemote", rechargeLink);
        return rechargeLink.token;
    }

    if (membershipRechargeToken && membershipRechargeToken != "这里替换成_IdBotAuto_对应的_recharge_token") {
        记录关键日志("recharge.link.useLocalFallback", { rechargeToken: membershipRechargeToken, appName: membershipAppName, appCode: membershipAppCode });
        toastLog("接口未查到充值链接，已自动回退到本地配置的 recharge token");
        return membershipRechargeToken;
    }

    toastLog("未找到可用充值链接，请先在会员后台为 " + membershipAppName + " 配置 active 充值链接");
    return null;
}''',
'recharge_token')

replace_once(
'''        let iframeUrl = membershipWebBase + (ticketData.consume_url || ("/sso/consume?ticket=" + encodeURIComponent(ticketData.ticket)));''',
'''        let iframeUrl = membershipWebBase + (ticketData.consume_url || ("/sso/consume?ticket=" + encodeURIComponent(ticketData.ticket)));
        记录关键日志("recharge.iframe.url", iframeUrl);''',
'iframe_log')

replace_once(
'''            function 关闭充值页并刷新() {
                dialog.dismiss();
                threads.start(function () {
                    获取我的信息();
                    ui.run(function () {
                        刷新我的页面();
                        toastLog("会员信息已刷新");
                    });
                });
            }''',
'''            function 关闭充值页并刷新() {
                dialog.dismiss();
                threads.start(function () {
                    let ok = 获取我的信息();
                    记录关键日志("recharge.afterRefresh", {
                        ok: ok,
                        memberLevel: 控件信息.memberLevel,
                        memberStatus: 控件信息.memberStatus,
                        expireAt: 控件信息.memberExpireAt
                    });
                    ui.run(function () {
                        刷新我的页面();
                        toastLog("会员信息已刷新");
                    });
                });
            }''',
'refresh_log')

# tutorial page frame replace webview -> text
s = s.replace(
'''                            <frame>
                                <vertical w="*" h="*" padding="12dp 12dp 12dp 12dp">
                                    <text text="使用教程" textSize="18sp" textStyle="bold" textColor="#333333" marginBottom="8dp" />
                                    <text text="当前先用百度首页占位，后面可以替换成正式教程页。" textSize="13sp" textColor="#666666" marginBottom="8dp" />
                                    <webview id="使用教程网页" w="*" h="*" />
                                </vertical>
                            </frame >''',
'''                            <scroll>
                                <vertical w="*" h="*" padding="12dp 12dp 12dp 12dp">
                                    <text text="使用教程" textSize="18sp" textStyle="bold" textColor="#333333" marginBottom="8dp" />
                                    <text id="使用教程文本" text="" textSize="14sp" textColor="#444444" lineSpacingExtra="6dp" />
                                </vertical>
                            </scroll >''',
1)

# member expire display formatting if old cached raw string shows no change handled in sync; also refresh display maybe ensure readable
replace_once(
'''        let expire = 控件信息.memberExpireAt || "无";''',
'''        let expire = 格式化时间显示(控件信息.memberExpireAt || "无");''',
'expire_display')

# avoid duplicate login response replacement? done maybe. normalize blanks
s = re.sub(r'\n{3,}', '\n\n', s)
p.write_text(s)
print('patched')
