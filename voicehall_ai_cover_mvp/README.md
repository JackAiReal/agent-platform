# VoiceHall AI Cover MVP (方案1：非实时点歌翻唱)

这是一个可直接跑起来的第一版服务：
- 上传歌曲
- 后台生成翻唱任务
- 轮询任务状态
- 成功后返回可播放链接

> 当前版本是**可运行MVP**：Demucs / RVC 可选，未配置时会走降级路径（可验证完整链路）。

## 1. 启动（局域网可访问）

```bash
cd voicehall_ai_cover_mvp
./run_lan.sh
```

默认监听：`0.0.0.0:8000`

查看本机局域网IP（macOS）：
```bash
ipconfig getifaddr en0
```

例如返回 `192.168.31.10`，则同局域网设备可访问：
- `http://192.168.31.10:8000/health`
- `http://192.168.31.10:8000/docs`

## 2. API

### 创建任务
```bash
curl -X POST "http://127.0.0.1:8000/covers/tasks" \
  -F "source=@/path/to/song.mp3" \
  -F "song_name=测试歌曲" \
  -F "voice_model=singer_a" \
  -F "pitch_shift=0"
```

### 查询任务状态
```bash
curl "http://127.0.0.1:8000/covers/tasks/<task_id>"
```

### 获取结果
```bash
curl "http://127.0.0.1:8000/covers/tasks/<task_id>/result"
```

返回示例：
```json
{
  "task_id": "...",
  "song_name": "测试歌曲",
  "result_url": "/files/results/<task_id>/cover.mp3"
}
```

拼接完整 URL 后可直接播放。

## 3. 可选：接入真实 RVC 推理

设置环境变量 `RVC_INFER_CMD`，例如：

```bash
export RVC_INFER_CMD='python /opt/rvc/infer.py --input {input} --output {output} --model {model} --pitch {pitch}'
```

说明：
- `{input}` `{output}` `{model}` `{pitch}` 会被自动替换。
- 未设置时，系统会直接复制人声（用于调通流程）。

## 4. 目录结构

```text
voicehall_ai_cover_mvp/
  app/
    main.py
    config.py
    models.py
    services/
      store.py
      task_manager.py
      pipeline.py
  data/
    uploads/
    results/
    tasks/tasks.json
  requirements.txt
  run_lan.sh
```

## 5. 注意事项

- 需要先安装 `ffmpeg`（必需）
- `demucs` 可选，不安装时会走降级逻辑
- 这是第一版MVP，适合先打通链路和接入语音厅播放
