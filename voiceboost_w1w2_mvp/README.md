# VoiceBoost W1-W2 MVP（主播付费软件：第1-2周跑通版）

这个版本用于把第1-2周核心能力跑通：
- 音频处理链（降噪门限/高通/去齿音/压缩/限幅）
- 场景预设（chat/sing/radio/pk）
- 自动校准（输入10秒样本给推荐参数）
- 防翻车风险检测（削波、音量过低）

> 当前是工程验证版：输入为 **16-bit PCM WAV**，输出为处理后 WAV。
>
> 运行环境建议：Python 3.10+

## 启动

### macOS / Linux
```bash
cd voiceboost_w1w2_mvp
./run_lan.sh
```

### Windows
```bat
cd voiceboost_w1w2_mvp
run_windows.bat
```

接口：
- `GET /health`
- `GET /presets`
- `POST /calibrate`
- `POST /process`
- 文档：`/docs`

## 局域网访问

启动后默认监听 `0.0.0.0:8010`，同局域网设备可访问：

`http://<你的局域网IP>:8010/docs`

## API 示例

### 1) 自动校准
```bash
curl -X POST 'http://127.0.0.1:8010/calibrate' \
  -F 'source=@./demo.wav'
```

### 2) 按预设处理
```bash
curl -X POST 'http://127.0.0.1:8010/process' \
  -F 'source=@./demo.wav' \
  -F 'preset=chat'
```

### 3) 带校准参数处理
```bash
curl -X POST 'http://127.0.0.1:8010/process' \
  -F 'source=@./demo.wav' \
  -F 'preset=chat' \
  -F 'calibration_json={"input_gain_db":4.2,"compressor_ratio":3.5}'
```

## 目录

```text
voiceboost_w1w2_mvp/
  app/
    main.py
    dsp.py
    presets.py
    calibration.py
    wav_io.py
    config.py
  data/
    uploads/
    outputs/
    calibration/
  run_lan.sh
  requirements.txt
```
