function createAutomationAdapter(shared) {
    return {
        config: {
            appName: "咪鸭",
            launchAppName: "咪鸭",
            idType: "page_data_9",
            apkPackage: "com.jiuyin.mc",
            appVersion: "1.6.51",
            fullIdPre: "com.jiuyin.mc:id/"
        },
        executeTask: function (ctx) {
            const toastLog = ctx.toastLog;
            const randomSleep = ctx.randomSleep;
            const 安全等待 = ctx.安全等待;
            const clickCenterByObj = ctx.clickCenterByObj;
            const loopResultIdTimer = ctx.loopResultIdTimer;
            const loopResultTextTimer = ctx.loopResultTextTimer;
            const backIndexId = ctx.backIndexId;
            const threadRunOne = ctx.threadRunOne;
            const getIds = ctx.getIds;
            const 创建写作业统计元信息 = ctx.创建写作业统计元信息;
            const 记录写作业统计处理开始 = ctx.记录写作业统计处理开始;
            const 记录写作业统计跳过 = ctx.记录写作业统计跳过;
            const 记录写作业统计成功 = ctx.记录写作业统计成功;
            const judgeSex = ctx.judgeSex;
            const judgIsAnchor = ctx.judgIsAnchor;
            const judgMoneyValue = ctx.judgMoneyValue;
            const myConsole = ctx.myConsole;
            const RandomInt = ctx.RandomInt;
            const pressOk = ctx.pressOk;
            const setTextValue = ctx.setText;
            const clickPoint = ctx.click;
            const idSelector = ctx.idSelector;

            toastLog("寻找首页中...")
            randomSleep(parseInt(ctx.get当前配置().操作延迟小), parseInt(ctx.get当前配置().操作延迟大))
            if (!loopResultIdTimer(ctx.getFullIdPre() + "edit", 5)) {
                backIndexId(ctx.getFullIdPre() + "iv_search")
                randomSleep(parseInt(ctx.get当前配置().操作延迟小), parseInt(ctx.get当前配置().操作延迟大))
                clickCenterByObj(loopResultIdTimer(ctx.getFullIdPre() + "iv_search", 8))
            }
            let timer = 0

            while (1) {
                let 控件信息 = ctx.get当前配置();
                let fullIdPre = ctx.getFullIdPre();
                let within = ctx.getWithin();
                let res = threadRunOne(getIds, within)
                if (res.hasOwnProperty("code") && res.data.data.length > 0) {
                    toastLog("获取到" + res.data.data.length + "条ID数据")
                    for (let i = 0; i < res.data.data.length; i++) {
                        控件信息 = ctx.get当前配置();
                        fullIdPre = ctx.getFullIdPre();
                        randomSleep(parseInt(控件信息.操作延迟小), parseInt(控件信息.操作延迟大))
                        let idStr
                        let 当前统计元信息 = 创建写作业统计元信息(res, res.data.data[i])
                        if (!(res.hasOwnProperty("type") && res["type"] == "local_id") && timer >= parseInt(控件信息.操作阈值)) {
                            toastLog("达到操作阈值，任务停止...")
                            randomSleep(parseInt(控件信息.操作延迟小), parseInt(控件信息.操作延迟大))
                            return
                        }
                        记录写作业统计处理开始(当前统计元信息)
                        if (res.hasOwnProperty("type") && res["type"] == "local_id") {
                            idStr = 当前统计元信息.id
                        } else {
                            let sex = judgeSex()
                            let jsonData = 当前统计元信息.jsonData || {}
                            if (sex !== "") {
                                console.log("进入性别判断")
                                if (jsonData["gender_text"] !== sex) {
                                    myConsole("性别" + jsonData["gender_text"] + "不符合")
                                    记录写作业统计跳过("性别不符", 当前统计元信息)
                                    continue
                                }
                            }
                            let isAnchor = judgIsAnchor()
                            if (isAnchor !== "" && jsonData["is_anchor"] !== null) {
                                console.log("进入主播判断")
                                if (jsonData["is_anchor"] !== isAnchor) {
                                    myConsole("模特" + jsonData["is_anchor"] + "不符合")
                                    记录写作业统计跳过("模特过滤", 当前统计元信息)
                                    continue
                                }
                            }
                            let moneyValue = jsonData["value"]
                            if (控件信息.消费范围_box) {
                                console.log("进入消费范围判断")
                                let isOk = judgMoneyValue(moneyValue)
                                if (!isOk) {
                                    myConsole("消费范围" + moneyValue + "不符合")
                                    记录写作业统计跳过("消费范围不符", 当前统计元信息)
                                    continue
                                }
                            }
                            idStr = 当前统计元信息.id
                        }
                        当前统计元信息.id = idStr ? String(idStr).trim() : ""
                        if (!当前统计元信息.id) {
                            myConsole((res.data.data[i]["content"] || res.data.data[i]) + "===>" + idStr)
                            记录写作业统计跳过("ID解析失败", 当前统计元信息)
                            continue
                        }
                        idStr = 当前统计元信息.id
                        if (控件信息.重复不写_box) {
                            if (ctx.getLongCache().indexOf(idStr) != -1) {
                                myConsole("long_cache idStr: " + idStr + "已存在缓存")
                                记录写作业统计跳过("重复不写", 当前统计元信息)
                                continue
                            }
                        } else {
                            if (ctx.getCache().indexOf(idStr) != -1) {
                                myConsole("idStr: " + idStr + "已存在缓存")
                                记录写作业统计跳过("重复不写", 当前统计元信息)
                                continue
                            }
                        }

                        toastLog("开始ID: " + idStr)
                        ctx.写入缓存(idStr, true)

                        let inputBar = loopResultIdTimer(fullIdPre + "edit", 5)
                        if (inputBar) {
                            if (inputBar.clickable()) {
                                inputBar.click()
                            } else {
                                clickCenterByObj(inputBar)
                            }
                        }
                        randomSleep(parseInt(控件信息.操作延迟小), parseInt(控件信息.操作延迟大))
                        setTextValue(idStr.trim())
                        toastLog("等待搜索结果")
                        randomSleep(parseInt(控件信息.操作延迟小), parseInt(控件信息.操作延迟大))
                        randomSleep(parseInt(控件信息.操作延迟小), parseInt(控件信息.操作延迟大))
                        if (控件信息.搜索坐标_box) {
                            toastLog("点击坐标: x" + 控件信息.搜索位置X + ",y" + 控件信息.搜索位置Y)
                            if (parseInt(控件信息.搜索位置X) > 0 && parseInt(控件信息.搜索位置Y) > 0) {
                                clickPoint(parseInt(控件信息.搜索位置X), parseInt(控件信息.搜索位置Y))
                                RandomInt(parseInt(控件信息.操作延迟小), parseInt(控件信息.操作延迟大))
                            }
                        } else {
                            toastLog("自动回车")
                            pressOk()
                        }
                        randomSleep(parseInt(控件信息.操作延迟小), parseInt(控件信息.操作延迟大))
                        let userID = loopResultIdTimer(fullIdPre + "tv_username", 5)
                        if (!userID) {
                            myConsole("id: " + idStr + "没有搜到")
                            记录写作业统计跳过("搜索无结果", 当前统计元信息)
                            continue
                        }

                        clickCenterByObj(userID)
                        randomSleep(parseInt(控件信息.操作延迟小), parseInt(控件信息.操作延迟大))
                        let goChat = loopResultTextTimer("聊天", 5)
                        if (!goChat) {
                            myConsole("id: " + idStr + "没有按钮")
                            记录写作业统计跳过("无法进入聊天", 当前统计元信息)
                            continue
                        } else {
                            clickCenterByObj(goChat)
                        }
                        randomSleep(parseInt(控件信息.操作延迟小), parseInt(控件信息.操作延迟大))
                        ctx.setRestartStatus("正常")
                        if (控件信息.发送图片_box) {
                            let imageBtn = loopResultIdTimer(fullIdPre + "chat_btn_album", 3)
                            if (imageBtn && imageBtn.clickable()) {
                                imageBtn.click()
                            } else {
                                clickCenterByObj(imageBtn)
                            }
                            let image_poses = ctx.获取图片位置数组();
                            loopResultIdTimer(fullIdPre + "select_frame")
                            randomSleep(parseInt(控件信息.操作延迟小), parseInt(控件信息.操作延迟大))
                            let imageSeles = idSelector(fullIdPre + "select_frame").visibleToUser(true).find()
                            randomSleep(parseInt(控件信息.操作延迟小), parseInt(控件信息.操作延迟大))
                            toastLog("当前图片选择位置" + image_poses)
                            console.log(image_poses)
                            if (imageSeles.length >= image_poses.length) {
                                image_poses.forEach(pos => {
                                    let aimPos = parseInt(pos) - 1
                                    if (imageSeles[aimPos].clickable()) {
                                        imageSeles[aimPos].click()
                                    } else {
                                        clickCenterByObj(imageSeles[aimPos])
                                    }
                                })
                            }
                            randomSleep(parseInt(控件信息.操作延迟小), parseInt(控件信息.操作延迟大))
                            clickCenterByObj(loopResultIdTimer(fullIdPre + "tv_complete", 3))
                        }
                        randomSleep(parseInt(控件信息.操作延迟小), parseInt(控件信息.操作延迟大))
                        if (控件信息.私信用户_box) {
                            let msg = ctx.获取随机话术文本()
                            myConsole(msg)
                            let msgs = String(msg || "").split("|")
                            msgs.forEach(itemMsg => {
                                setTextValue(itemMsg)
                                randomSleep(parseInt(控件信息.操作延迟小), parseInt(控件信息.操作延迟大))
                                clickCenterByObj(loopResultIdTimer(fullIdPre + "chat_send_button", 5))
                                randomSleep(parseInt(控件信息.操作延迟小), parseInt(控件信息.操作延迟大))
                            })
                        }
                        记录写作业统计成功(idStr, 当前统计元信息)
                        let sleepTime = RandomInt(parseInt(控件信息.任务间隔小), parseInt(控件信息.任务间隔大))
                        toastLog("等待" + sleepTime + "秒")
                        安全等待(sleepTime * 1000)
                        backIndexId(fullIdPre + "edit")
                    }
                    myConsole("页数比较: " + ctx.getPage() + ":" + res.data.total_pages)
                    if (parseInt(ctx.getPage()) === parseInt(res.data.total_pages)) {
                        myConsole("达到最大页数" + ctx.getPage())
                        安全等待(3000)
                        continue
                    } else {
                        ctx.setPage(parseInt(ctx.getPage()) + 1)
                        myConsole("页数+1：" + ctx.getPage())
                    }
                } else {
                    toastLog(res.msg + "60秒后重试")
                    安全等待(60 * 1000)
                }
            }
        }
    };
}
