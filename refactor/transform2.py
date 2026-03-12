from pathlib import Path
import re

p = Path('/Users/jackgong/.openclaw/workspace/refactor/source.js')
s = p.read_text()

def replace_once(src, old, new, label):
    if old not in src:
        raise SystemExit(f'{label} not found')
    return src.replace(old, new, 1)

# 1) Replace header/config block
old_header = Path('/Users/jackgong/.openclaw/workspace/refactor/transform.py').read_text().split("old_header = '''",1)[1].split("'''\n\nnew_header",1)[0]
new_header = Path('/Users/jackgong/.openclaw/workspace/refactor/transform.py').read_text().split("new_header = '''",1)[1].split("'''\n\ns = replace_once",1)[0]
s = replace_once(s, old_header, new_header, 'header')

# 2) Replace all direct persistence calls with helper
s = s.replace('storage.put("控件存储", 控件信息);', '保存控件信息();')

# 3) WebView setup dedupe
register_old = '''        ui.run(function () {
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
register_new = '''        ui.run(function () {
            配置内嵌网页(webView, "注册页");
            webView.loadUrl(membershipShareUrl);
        });
'''
s = replace_once(s, register_old, register_new, 'register_web')

recharge_old = '''            let webView = rechargeView.充值网页;
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
recharge_new = '''            let webView = rechargeView.充值网页;
            配置内嵌网页(webView, "充值页");
            webView.loadUrl(iframeUrl);
'''
s = replace_once(s, recharge_old, recharge_new, 'recharge_web')

# 4) Membership defaults helper
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

# 5) 首页统计改成 helper
s = replace_once(s,
'''    let 添加数据 = 控件信息.操作记录list.filter((Value2) => {
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
''',
'    刷新操作记录统计();\n',
'home_stats')

# 6) Merge duplicate resume handlers with regex
resume_pattern = re.compile(r'ui\.emitter\.on\("resume", function \(\) \{\n\s*ui\.无障碍\.checked = auto\.service != null;\n\s*ui\.悬浮窗\.checked = floaty\.checkPermission\(\) != false;\n\s*ui\.打印日志\.checked = 控件信息\.打印日志 == true;\n\s*刷新我的页面\(\);\n\s*\}\);\n\n\n\s*ui\.emitter\.on\("resume", function \(\) \{\n\s*ui\.无障碍\.checked = auto\.service != null;\n\s*ui\.悬浮窗\.checked = floaty\.checkPermission\(\) != false;\n\s*ui\.打印日志\.checked = 控件信息\.打印日志 == true;\n\s*ui\.操作记录list\.setDataSource\(控件信息\.操作记录list \|\| \[\]\);\n\s*let 添加数据 = 控件信息\.操作记录list\.filter\(\(Value2\) => \{\n\s*return Value2\.添加;\n\s*\}\);\n\s*let 私信数据 = 控件信息\.操作记录list\.filter\(\(Value2\) => \{\n\s*return Value2\.私信;\n\s*\}\);\n\n\s*let 拨打数据 = 控件信息\.操作记录list\.filter\(\(Value2\) => \{\n\s*return Value2\.拨打;\n\s*\}\);\n\n\s*ui\.私信记录\.setText\("私信:" \+ String\(私信数据\.length\)\);\n\s*ui\.添加记录\.setText\("添加:" \+ String\(添加数据\.length\)\);\n\s*ui\.拨打记录\.setText\("拨打:" \+ String\(拨打数据\.length\)\);\n\s*\}\);')
s, count = resume_pattern.subn('ui.emitter.on("resume", function () {\n        同步首页状态();\n    });', s, count=1)
if count != 1:
    raise SystemExit(f'resume_block count={count}')

# 7) 清除记录走 helper
clear_pattern = re.compile(r'ui\.清除记录\.on\("click", function \(\) \{\n\s*控件信息\.操作记录list = \[\];\n\s*let 添加数据 = 控件信息\.操作记录list\.filter\(\(Value2\) => \{\n\s*return Value2\.添加;\n\s*\}\);\n\s*let 私信数据 = 控件信息\.操作记录list\.filter\(\(Value2\) => \{\n\s*return Value2\.私信;\n\s*\}\);\n\s*ui\.私信记录\.setText\("私信:" \+ String\(私信数据\.length\)\);\n\s*ui\.添加记录\.setText\("添加:" \+ String\(添加数据\.length\)\);\n\s*ui\.操作记录list\.setDataSource\(控件信息\.操作记录list \|\| \[\]\);\n\s*toastLog\("清除成功"\);\n\s*\}\);')
s, count = clear_pattern.subn('ui.清除记录.on("click", function () {\n        控件信息.操作记录list = [];\n        刷新操作记录统计();\n        toastLog("清除成功");\n    });', s, count=1)
if count != 1:
    raise SystemExit(f'clear_block count={count}')

# 8) Recharge token message / thread helper
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
'recharge_msg')

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

# 9) Small cleanup
s = s.replace('\n// uiStorage.clear()', '')
s = s.replace('\n// 首页ui()', '')
s = re.sub(r'\n{3,}', '\n\n', s)

out = Path('/Users/jackgong/.openclaw/workspace/refactor/全平台全自动写作业_登录系统_优化版.js')
out.write_text(s)
print(out)
print('lines', s.count('\n') + 1)
