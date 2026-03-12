from pathlib import Path
import re

p = Path('/Users/jackgong/.openclaw/workspace/refactor/全平台全自动写作业_登录系统_优化版.js')
s = p.read_text()

def replace_once(old, new, label):
    global s
    if old not in s:
        raise SystemExit(f'{label} not found')
    s = s.replace(old, new, 1)

# 1) app code/name back to IdBotAuto
replace_once(
'''const MEMBERSHIP_CONFIG = {
    apiBase: "https://membership.8188811.xyz/api",
    shareUrl: "https://membership.8188811.xyz/share/VoBJgMG8j7Qiog1jh3uRIhi7aCgkAFfZ",
    appCode: "IDBot",
    appName: "IDBot",
    appSecret: "01xL99-xolszV5T_51eEjbkdxOb0PI8VWU0FvhZU6gw",
    rechargeToken: ""
};''',
'''const MEMBERSHIP_CONFIG = {
    apiBase: "https://membership.8188811.xyz/api",
    shareUrl: "https://membership.8188811.xyz/share/VoBJgMG8j7Qiog1jh3uRIhi7aCgkAFfZ",
    appCode: "IdBotAuto",
    appName: "IdBotAuto",
    appSecret: "01xL99-xolszV5T_51eEjbkdxOb0PI8VWU0FvhZU6gw",
    rechargeToken: ""
};''',
'config')

# 2) startup/login session helpers + tutorial loader
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
}

登录ui();''',
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
}

function 清空登录会话(是否清空账号密码) {
    控件信息.token = "";
    控件信息.refresh_token = "";
    控件信息.userInfo = null;
    控件信息.entitlements = [];
    控件信息.memberAvailable = false;
    控件信息.loginCaptchaEnabled = false;
    重置会员信息();
    if (是否清空账号密码) {
        控件信息.账号 = "";
        控件信息.密码 = "";
    }
    保存控件信息();
}

function 退出登录() {
    清空登录会话(false);
    toastLog("已退出登录");
    登录ui();
}

function 加载使用教程页面() {
    if (!ui.使用教程网页) return;
    配置内嵌网页(ui.使用教程网页, "使用教程");
    ui.使用教程网页.loadUrl("https://www.baidu.com");
}

function 启动入口() {
    if (!控件信息.token) {
        登录ui();
        return;
    }

    threads.start(function () {
        let ok = 获取我的信息();
        ui.run(function () {
            if (ok) {
                首页ui();
                toastLog("已恢复登录状态");
            } else {
                清空登录会话(false);
                登录ui();
            }
        });
    });
}

启动入口();''',
'startup_block')

# 3) 调整充值按钮文字位置
replace_once(
'''                                            <vertical id="充值按钮" w="*" h="*" gravity="center">
                                                <text text="立即充值" textColor="#FFFFFF" textSize="15sp" textStyle="bold" />
                                            </vertical>''',
'''                                            <vertical id="充值按钮" w="*" h="*" gravity="center">
                                                <text w="*" gravity="center" paddingLeft="8dp" text="立即充值" textColor="#FFFFFF" textSize="15sp" textStyle="bold" />
                                            </vertical>''',
'recharge_button_text')

# 4) 增加退出登录按钮
replace_once(
'''                                <card w="*" h="auto" cardCornerRadius="10dp"
                                    marginTop="5dp" cardBackgroundColor='#F1F9FA' cardElevation="0dp"  >
                                    <frame w="*" h="auto" id='退出' padding="15dp 22dp">''',
'''                                <card w="*" h="auto" cardCornerRadius="10dp"
                                    marginTop="5dp" cardBackgroundColor='#F1F9FA' cardElevation="0dp"  >
                                    <frame w="*" h="auto" id='退出登录' padding="15dp 22dp">
                                        <horizontal w="auto" h="auto" layout_gravity="left|center_vertical" gravity="center_vertical">
                                            <img w="28dp" h="28dp" src="ic_lock_outline_black_48dp" scaleType="fitEnd" />
                                            <text w="auto" h="auto" textSize="16sp" textColor="#333333" text="退出登录" marginLeft="11dp" />
                                        </horizontal>
                                        <img w="25dp" h="25dp" src="ic_keyboard_arrow_right_black_48dp" layout_gravity="right|center_vertical" scaleType="fitEnd" tint="#D3D3D3" />
                                    </frame>
                                </card>
                                <card w="*" h="auto" cardCornerRadius="10dp"
                                    marginTop="5dp" cardBackgroundColor='#F1F9FA' cardElevation="0dp"  >
                                    <frame w="*" h="auto" id='退出' padding="15dp 22dp">''',
'logout_button')

# 5) second tab -> tutorial page
pattern = re.compile(r'''\n\s*<scroll\s+>\n\s*<vertical gravity="center_vertical" padding='10'>.*?<list id="操作记录list" w='\*' h='auto'>.*?</list>\n\s*</vertical>\n\s*</scroll >''', re.S)
replacement = '''
                            <frame>
                                <vertical w="*" h="*" padding="12dp 12dp 12dp 12dp">
                                    <text text="使用教程" textSize="18sp" textStyle="bold" textColor="#333333" marginBottom="8dp" />
                                    <text text="当前先用百度首页占位，后面可以替换成正式教程页。" textSize="13sp" textColor="#666666" marginBottom="8dp" />
                                    <webview id="使用教程网页" w="*" h="*" />
                                </vertical>
                            </frame >'''
s, count = pattern.subn(replacement, s, count=1)
if count != 1:
    raise SystemExit(f'tutorial_page replace count={count}')

# 6) titles and direct record references
replace_once('''    ui.viewpager.setTitles(["运行设置", "操作记录"]);''', '''    ui.viewpager.setTitles(["运行设置", "使用教程"]);''', 'tab_titles')
replace_once('''    ui.操作记录list.setDataSource(控件信息.操作记录list || []);''', '''    ui.操作记录list && ui.操作记录list.setDataSource(控件信息.操作记录list || []);
    加载使用教程页面();''', 'record_datasource')
replace_once('''    ui.清除记录.on("click", function () {
        控件信息.操作记录list = [];
        刷新操作记录统计();
        toastLog("清除成功");
    });''', '''    ui.清除记录 && ui.清除记录.on("click", function () {
        控件信息.操作记录list = [];
        刷新操作记录统计();
        toastLog("清除成功");
    });''', 'clear_guard')

# 7) logout event
replace_once('''    ui.退出.click(() => { engines.stopAll(); });''', '''    ui.退出登录 && ui.退出登录.click(() => { 退出登录(); });
    ui.退出.click(() => { engines.stopAll(); });''', 'logout_event')

# 8) tutorial helper safe with sync state already okay

# 9) keep operation record helper but harmless; no changes

# 10) normalize blank lines
s = re.sub(r'\n{3,}', '\n\n', s)
p.write_text(s)
print('patched', p)
