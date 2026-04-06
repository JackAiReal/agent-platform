#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from __future__ import annotations

import io
import json
import math
import os
import re
import secrets
import signal
import shutil
import subprocess
import sys
import threading
import time
import zipfile
from collections import deque
from datetime import datetime
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib import error as urllib_error
from urllib import request as urllib_request

from auto_pool_maintainer import build_cpa_payload, build_sub2api_payload, get_candidates_count

PROJECT_ROOT = Path(__file__).resolve().parent
APP_DATA_DIR = Path(os.environ.get("APP_DATA_DIR", str(PROJECT_ROOT)))
CONFIG_PATH = Path(os.environ.get("APP_CONFIG_PATH", str(APP_DATA_DIR / "config.json")))
LOGS_DIR = Path(os.environ.get("APP_LOG_DIR", str(APP_DATA_DIR / "logs")))
TEMPLATE_CONFIG_PATH = Path(os.environ.get("APP_TEMPLATE_CONFIG_PATH", str(PROJECT_ROOT / "config.example.json")))
API_HOST = os.environ.get("APP_HOST", "127.0.0.1")
API_PORT = int(os.environ.get("APP_PORT", "8318"))
ADMIN_TOKEN_ENV = os.environ.get("APP_ADMIN_TOKEN", "").strip()
ADMIN_TOKEN_FILE = Path(os.environ.get("APP_ADMIN_TOKEN_FILE", str(APP_DATA_DIR / "admin_token.txt")))
RUN_STATE_FILE = Path(os.environ.get("APP_RUN_STATE_FILE", str(APP_DATA_DIR / ".maintainer_run_state.json")))
BATCH_RUN_STATE_FILE = Path(os.environ.get("APP_BATCH_RUN_STATE_FILE", str(APP_DATA_DIR / ".batch_run_state.json")))
OUTPUT_TOKENS_DIR = Path(os.environ.get("APP_OUTPUT_TOKENS_DIR", str(APP_DATA_DIR / "output_tokens")))
MASKED_VALUE = "__MASKED__"
RUN_PROCESS: Optional[subprocess.Popen[str]] = None
RUN_MODE: str = ""
RUN_LOG_PATH: str = ""
RUN_PROCESS_LOCK = threading.Lock()
BATCH_PROCESS: Optional[subprocess.Popen[str]] = None
BATCH_MODE: str = ""
BATCH_LOG_PATH: str = ""
BATCH_TARGET_COUNT: int = 0
BATCH_PROCESS_LOCK = threading.Lock()
ADMIN_TOKEN_LOCK = threading.Lock()
ADMIN_TOKEN_CACHE: Optional[str] = None
IS_WINDOWS = os.name == "nt"


def ensure_runtime_paths() -> None:
    APP_DATA_DIR.mkdir(parents=True, exist_ok=True)
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    ADMIN_TOKEN_FILE.parent.mkdir(parents=True, exist_ok=True)
    RUN_STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    BATCH_RUN_STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_TOKENS_DIR.mkdir(parents=True, exist_ok=True)


def load_run_state() -> Dict[str, Any]:
    ensure_runtime_paths()
    if not RUN_STATE_FILE.exists():
        return {}
    try:
        data = json.loads(RUN_STATE_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {}
    return data if isinstance(data, dict) else {}


def save_run_state(pid: int, mode: str, log_path: str = "") -> None:
    ensure_runtime_paths()
    payload = {
        "pid": int(pid),
        "mode": str(mode or ""),
        "log_path": str(log_path or ""),
        "updated_at": datetime.now().isoformat(),
    }
    RUN_STATE_FILE.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")


def clear_run_state() -> None:
    try:
        RUN_STATE_FILE.unlink(missing_ok=True)
    except Exception:
        pass


def load_batch_run_state() -> Dict[str, Any]:
    ensure_runtime_paths()
    if not BATCH_RUN_STATE_FILE.exists():
        return {}
    try:
        data = json.loads(BATCH_RUN_STATE_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {}
    return data if isinstance(data, dict) else {}


def save_batch_run_state(pid: int, mode: str, log_path: str = "", target_count: int = 0) -> None:
    ensure_runtime_paths()
    payload = {
        "pid": int(pid),
        "mode": str(mode or ""),
        "log_path": str(log_path or ""),
        "target_count": int(target_count or 0),
        "updated_at": datetime.now().isoformat(),
    }
    BATCH_RUN_STATE_FILE.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")


def clear_batch_run_state() -> None:
    try:
        BATCH_RUN_STATE_FILE.unlink(missing_ok=True)
    except Exception:
        pass


def is_pid_running(pid: int) -> bool:
    if pid <= 0:
        return False
    if IS_WINDOWS:
        return is_pid_running_windows(pid)
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    except Exception:
        return False


def is_pid_running_windows(pid: int) -> bool:
    try:
        result = subprocess.run(
            ["tasklist", "/FI", f"PID eq {pid}", "/FO", "CSV", "/NH"],
            capture_output=True,
            text=True,
            timeout=5,
        )
    except Exception:
        return False

    if result.returncode != 0:
        return False

    output = (result.stdout or "").strip()
    if not output:
        return False
    if output.startswith("INFO:"):
        return False
    return f'"{pid}"' in output or f",{pid}," in output


def read_running_state() -> tuple[Optional[int], str, str]:
    state = load_run_state()
    raw_pid = state.get("pid")
    mode = str(state.get("mode") or "")
    log_path = str(state.get("log_path") or "")
    try:
        pid = int(raw_pid)
    except Exception:
        return None, mode, log_path
    if not is_pid_running(pid):
        clear_run_state()
        return None, mode, log_path
    return pid, mode, log_path


def read_batch_running_state() -> tuple[Optional[int], str, str, int]:
    state = load_batch_run_state()
    raw_pid = state.get("pid")
    mode = str(state.get("mode") or "")
    log_path = str(state.get("log_path") or "")
    try:
        target_count = int(state.get("target_count") or 0)
    except Exception:
        target_count = 0
    try:
        pid = int(raw_pid)
    except Exception:
        return None, mode, log_path, target_count
    if not is_pid_running(pid):
        clear_batch_run_state()
        return None, mode, log_path, target_count
    return pid, mode, log_path, target_count


def terminate_pid(pid: int, timeout_seconds: float = 8.0) -> bool:
    if not is_pid_running(pid):
        return True

    if IS_WINDOWS:
        return terminate_pid_tree_windows(pid, timeout_seconds=timeout_seconds)

    try:
        os.kill(pid, signal.SIGTERM)
    except ProcessLookupError:
        return True
    except Exception:
        return False

    deadline = time.time() + max(0.5, timeout_seconds)
    while time.time() < deadline:
        if not is_pid_running(pid):
            return True
        time.sleep(0.2)
    try:
        os.kill(pid, signal.SIGKILL)
    except ProcessLookupError:
        return True
    except Exception:
        return False
    return not is_pid_running(pid)


def terminate_pid_tree_windows(pid: int, timeout_seconds: float = 8.0) -> bool:
    if not is_pid_running(pid):
        return True

    command = ["taskkill", "/PID", str(pid), "/T"]
    graceful_result = subprocess.run(command, capture_output=True, text=True, timeout=max(5, int(timeout_seconds)))
    if graceful_result.returncode != 0 and is_pid_running(pid):
        force_result = subprocess.run(
            command + ["/F"],
            capture_output=True,
            text=True,
            timeout=max(5, int(timeout_seconds)),
        )
        if force_result.returncode != 0 and is_pid_running(pid):
            return False
        if force_result.returncode == 0:
            time.sleep(0.3)
            return True
    elif graceful_result.returncode == 0:
        time.sleep(0.3)
        return True

    deadline = time.time() + max(1.0, timeout_seconds)
    while time.time() < deadline:
        if not is_pid_running(pid):
            return True
        time.sleep(0.2)
    return not is_pid_running(pid)


def terminate_process_handle(process: subprocess.Popen[str], timeout_seconds: float = 8.0) -> bool:
    if process.poll() is not None:
        return True

    pid = process.pid
    try:
        process.terminate()
        try:
            process.wait(timeout=timeout_seconds)
            return True
        except subprocess.TimeoutExpired:
            pass
    except Exception:
        pass

    try:
        process.kill()
        try:
            process.wait(timeout=3)
            return True
        except subprocess.TimeoutExpired:
            pass
    except Exception:
        pass

    return terminate_pid(pid, timeout_seconds=max(timeout_seconds, 8.0))


def ensure_config_exists() -> None:
    ensure_runtime_paths()
    if CONFIG_PATH.exists():
        return
    if TEMPLATE_CONFIG_PATH.exists():
        shutil.copyfile(TEMPLATE_CONFIG_PATH, CONFIG_PATH)
        return
    raise RuntimeError(f"配置文件不存在，且模板不存在: {CONFIG_PATH} | {TEMPLATE_CONFIG_PATH}")


def get_admin_token() -> str:
    global ADMIN_TOKEN_CACHE

    with ADMIN_TOKEN_LOCK:
        if ADMIN_TOKEN_CACHE:
            return ADMIN_TOKEN_CACHE

        if ADMIN_TOKEN_ENV:
            ADMIN_TOKEN_CACHE = ADMIN_TOKEN_ENV
            return ADMIN_TOKEN_CACHE

        ensure_runtime_paths()
        if ADMIN_TOKEN_FILE.exists():
            token = ADMIN_TOKEN_FILE.read_text(encoding="utf-8").strip()
            if token:
                ADMIN_TOKEN_CACHE = validate_admin_token(token)
                return ADMIN_TOKEN_CACHE

        token = secrets.token_urlsafe(18)
        ADMIN_TOKEN_FILE.write_text(f"{token}\n", encoding="utf-8")
        try:
            os.chmod(ADMIN_TOKEN_FILE, 0o600)
        except OSError:
            pass
        ADMIN_TOKEN_CACHE = token
        return ADMIN_TOKEN_CACHE


def validate_admin_token(raw_value: Any) -> str:
    token = str(raw_value or "").strip()
    if not token:
        raise ValueError("登录页密码不能为空")
    if len(token) < 6:
        raise ValueError("登录页密码至少需要 6 位")
    if len(token) > 128:
        raise ValueError("登录页密码长度不能超过 128 位")
    if any(ord(char) < 32 for char in token):
        raise ValueError("登录页密码不能包含控制字符")
    return token


def update_admin_token(token: str) -> Dict[str, Any]:
    global ADMIN_TOKEN_CACHE

    if ADMIN_TOKEN_ENV:
        return {
            "ok": False,
            "updated": False,
            "read_only": True,
            "message": "当前管理令牌由 APP_ADMIN_TOKEN 环境变量托管，暂不支持在页面中修改",
        }

    normalized = validate_admin_token(token)
    ensure_runtime_paths()
    ADMIN_TOKEN_FILE.write_text(f"{normalized}\n", encoding="utf-8")
    try:
        os.chmod(ADMIN_TOKEN_FILE, 0o600)
    except OSError:
        pass

    with ADMIN_TOKEN_LOCK:
        ADMIN_TOKEN_CACHE = normalized

    return {
        "ok": True,
        "updated": True,
        "read_only": False,
        "message": "登录页密码已更新，当前会话已切换到新密码",
    }


def load_config() -> Dict[str, Any]:
    ensure_config_exists()
    with CONFIG_PATH.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, dict):
        raise RuntimeError("config.json 顶层必须是 JSON 对象")
    return data


def save_config(payload: Dict[str, Any]) -> None:
    if not isinstance(payload, dict):
        raise RuntimeError("配置数据必须是 JSON 对象")
    ensure_runtime_paths()
    merged = merge_config_with_sensitive_fields(load_config(), payload)
    with CONFIG_PATH.open("w", encoding="utf-8") as handle:
        json.dump(merged, handle, ensure_ascii=False, indent=2)
        handle.write("\n")


def mask_sensitive_config(config: Dict[str, Any]) -> Dict[str, Any]:
    masked = json.loads(json.dumps(config))
    sensitive_fields = [
        ("clean", "token"),
        ("mail", "api_key"),
        ("cfmail", "api_key"),
        ("duckmail", "bearer"),
        ("yyds_mail", "api_key"),
        ("sub2api", "password"),
    ]
    for section, key in sensitive_fields:
        sec = masked.get(section)
        if isinstance(sec, dict) and sec.get(key):
            sec[key] = MASKED_VALUE
    return masked


def merge_config_with_sensitive_fields(current: Dict[str, Any], incoming: Dict[str, Any]) -> Dict[str, Any]:
    merged = json.loads(json.dumps(incoming))
    sensitive_fields = [
        ("clean", "token"),
        ("mail", "api_key"),
        ("cfmail", "api_key"),
        ("duckmail", "bearer"),
        ("yyds_mail", "api_key"),
        ("sub2api", "password"),
    ]
    for section, key in sensitive_fields:
        current_section = current.get(section) if isinstance(current.get(section), dict) else {}
        merged_section = merged.get(section) if isinstance(merged.get(section), dict) else {}
        if merged_section.get(key) == MASKED_VALUE and key in current_section:
            merged_section[key] = current_section.get(key)
        merged[section] = merged_section

    return merged


def is_sensitive_field_masked(value: Any) -> bool:
    return isinstance(value, str) and value == MASKED_VALUE


def resolve_sensitive_provider_value(provider_name: str, key_name: str, incoming_value: Any) -> str:
    normalized_value = str(incoming_value or "").strip()
    if normalized_value and not is_sensitive_field_masked(normalized_value):
        return normalized_value

    try:
        current = load_config()
    except Exception:
        return ""

    provider_to_section_key = {
        "self_hosted_mail_api": ("mail", "api_key"),
        "cfmail": ("cfmail", "api_key"),
        "duckmail": ("duckmail", "bearer"),
        "yyds_mail": ("yyds_mail", "api_key"),
    }
    section_key = provider_to_section_key.get(str(provider_name or "").strip())
    if not section_key:
        return ""
    section_name, actual_key_name = section_key
    if key_name != "api_key":
        return ""

    section = current.get(section_name)
    if not isinstance(section, dict):
        return ""
    return str(section.get(actual_key_name) or "").strip()


def _trim_remote_error_text(value: str, limit: int = 240) -> str:
    compact = re.sub(r"\s+", " ", str(value or "")).strip()
    if len(compact) <= limit:
        return compact
    return f"{compact[:limit]}..."


def check_mail_domain_registry(provider: Any, api_base: Any, api_key: Any) -> Dict[str, Any]:
    provider_name = str(provider or "").strip()
    normalized_base = str(api_base or "").strip().rstrip("/")
    normalized_key = resolve_sensitive_provider_value(provider_name, "api_key", api_key)
    response: Dict[str, Any] = {
        "ok": False,
        "provider": provider_name,
        "api_base": normalized_base,
        "enabled_domains": [],
        "manual_domains": [],
        "composed_domains": [],
        "default_domain": "",
        "message": "",
    }

    if provider_name != "self_hosted_mail_api":
        response["message"] = "当前仅支持校验自建 Mail API 域名接入状态"
        return response
    if not normalized_base:
        response["message"] = "请先填写邮件 API 地址"
        return response
    if not normalized_key:
        response["message"] = "请先填写邮件 API 密钥"
        return response

    request = urllib_request.Request(
        f"{normalized_base}/api/admin/domains",
        headers={
            "Authorization": f"Bearer {normalized_key}",
            "Accept": "application/json",
            "User-Agent": "AutoPoolMaintainerAPI/0.1",
        },
        method="GET",
    )

    try:
        with urllib_request.urlopen(request, timeout=8) as remote_response:
            raw_payload = remote_response.read().decode("utf-8", errors="replace")
    except urllib_error.HTTPError as exc:
        error_body = exc.read().decode("utf-8", errors="replace")
        response["message"] = f"接码平台校验失败: HTTP {exc.code} { _trim_remote_error_text(error_body) }"
        return response
    except urllib_error.URLError as exc:
        response["message"] = f"接码平台校验失败: {exc.reason}"
        return response
    except Exception as exc:
        response["message"] = f"接码平台校验失败: {exc}"
        return response

    try:
        payload = json.loads(raw_payload or "{}")
    except Exception:
        response["message"] = "接码平台返回的域名注册表不是合法 JSON"
        return response

    registry = payload.get("registry") if isinstance(payload, dict) else {}
    summary = payload.get("summary") if isinstance(payload, dict) else {}
    registry_domains = registry.get("domains") if isinstance(registry, dict) else []

    enabled_domains: List[str] = []
    manual_domains: List[str] = []
    composed_domains: List[str] = []

    if isinstance(summary, dict):
        raw_composed = summary.get("composed_domains")
        if isinstance(raw_composed, list):
            composed_domains = sorted({str(item).strip().lower() for item in raw_composed if str(item).strip()})

    if isinstance(registry_domains, list):
        for item in registry_domains:
            if not isinstance(item, dict):
                continue
            root_domain = str(item.get("root_domain") or "").strip().lower()
            if not root_domain:
                continue
            if item.get("enabled"):
                enabled_domains.append(root_domain)
                if item.get("allow_manual_selection"):
                    manual_domains.append(root_domain)
                if item.get("wildcard_enabled"):
                    composed_domains.append(f"*.{root_domain}")
                composed_domains.append(root_domain)

    response["ok"] = bool(payload.get("ok")) if isinstance(payload, dict) else False
    response["enabled_domains"] = sorted(set(enabled_domains))
    response["manual_domains"] = sorted(set(manual_domains))
    response["composed_domains"] = sorted(set(composed_domains))
    response["default_domain"] = str(summary.get("default_domain") or "").strip().lower() if isinstance(summary, dict) else ""
    if response["ok"]:
        response["message"] = f"已连接 {len(response['enabled_domains'])} 个可用域名"
    else:
        response["message"] = "接码平台未返回可用域名注册表"
    return response


def get_latest_log_path(pattern: str = "pool_maintainer_*.log") -> Optional[Path]:
    ensure_runtime_paths()
    if not LOGS_DIR.exists():
        return None
    candidates = sorted(LOGS_DIR.glob(pattern), key=lambda item: item.stat().st_mtime, reverse=True)
    return candidates[0] if candidates else None


def tail_lines(path: Path, max_lines: int = 120) -> List[str]:
    buffer: deque[str] = deque(maxlen=max_lines)
    with path.open("r", encoding="utf-8", errors="replace") as handle:
        for line in handle:
            line = line.rstrip("\n")
            if line.strip():
                buffer.append(line)
    return list(buffer)


def tone_from_log(level: str, message: str) -> str:
    normalized_level = level.upper()
    normalized_message = message.lower()
    if normalized_level in {"ERROR", "CRITICAL"}:
        return "danger"
    if normalized_level == "WARNING":
        return "warning"
    if "成功" in message or "完成" in message or "已达标" in message:
        return "success"
    if "失败" in message or "异常" in message or "错误" in message:
        return "danger"
    if "等待" in message or "进度" in message:
        return "info"
    if "warning" in normalized_message:
        return "warning"
    return "muted"


def parse_log_line(index: int, raw_line: str) -> Dict[str, Any]:
    match = re.match(r"^(?P<date>\d{4}-\d{2}-\d{2}) (?P<clock>\d{2}:\d{2}:\d{2}) \| (?P<level>[A-Z]+) \| (?P<message>.*)$", raw_line)
    if not match:
        return {
            "id": f"log-{index}",
            "prefix": "[系统]",
            "timestamp": "[--:--:--]",
            "message": raw_line,
            "tone": "muted",
        }

    level = match.group("level")
    message = match.group("message")
    return {
        "id": f"log-{index}",
        "prefix": f"[{level}]",
        "timestamp": f"[{match.group('clock')}]",
        "message": message,
        "tone": tone_from_log(level, message),
    }


def build_single_account_timing(raw_lines: List[str], window_size: int = 20) -> Dict[str, Any]:
    pattern = re.compile(
        r"注册\+OAuth 成功: .*?\| 注册 (?P<reg>\d+(?:\.\d+)?)s \+ OAuth (?P<oauth>\d+(?:\.\d+)?)s = (?P<total>\d+(?:\.\d+)?)s"
    )
    samples: List[Dict[str, float]] = []
    for line in raw_lines:
        matched = pattern.search(line)
        if not matched:
            continue
        samples.append(
            {
                "reg": float(matched.group("reg")),
                "oauth": float(matched.group("oauth")),
                "total": float(matched.group("total")),
            }
        )

    result: Dict[str, Any] = {
        "latest_reg_seconds": None,
        "latest_oauth_seconds": None,
        "latest_total_seconds": None,
        "recent_avg_reg_seconds": None,
        "recent_avg_oauth_seconds": None,
        "recent_avg_total_seconds": None,
        "recent_slow_count": 0,
        "sample_size": 0,
        "window_size": max(1, int(window_size)),
    }
    if not samples:
        return result

    latest = samples[-1]
    recent = samples[-result["window_size"] :]
    result["latest_reg_seconds"] = round(latest["reg"], 1)
    result["latest_oauth_seconds"] = round(latest["oauth"], 1)
    result["latest_total_seconds"] = round(latest["total"], 1)
    result["recent_avg_reg_seconds"] = round(sum(item["reg"] for item in recent) / len(recent), 1)
    result["recent_avg_oauth_seconds"] = round(sum(item["oauth"] for item in recent) / len(recent), 1)
    result["recent_avg_total_seconds"] = round(sum(item["total"] for item in recent) / len(recent), 1)
    result["recent_slow_count"] = sum(1 for item in recent if item["total"] >= 100.0)
    result["sample_size"] = len(recent)
    return result


def parse_loop_next_check_in_seconds(raw_lines: List[str]) -> Optional[int]:
    pattern = re.compile(
        r"^(?P<date>\d{4}-\d{2}-\d{2}) (?P<clock>\d{2}:\d{2}:\d{2}) \| [A-Z]+ \| 循环模式休眠 (?P<seconds>\d+(?:\.\d+)?)s 后再次检查号池$"
    )
    now_ts = time.time()
    for line in reversed(raw_lines):
        matched = pattern.match(line.strip())
        if not matched:
            continue
        try:
            sleep_seconds = float(matched.group("seconds"))
            logged_at = datetime.strptime(
                f"{matched.group('date')} {matched.group('clock')}",
                "%Y-%m-%d %H:%M:%S",
            )
            next_check_ts = logged_at.timestamp() + sleep_seconds
            remaining = int(math.ceil(next_check_ts - now_ts))
            return max(0, remaining)
        except Exception:
            continue
    return None


def build_runtime_status() -> Dict[str, Any]:
    tracked_log_path = ""
    with RUN_PROCESS_LOCK:
        process = RUN_PROCESS
        running = process is not None and process.poll() is None
        run_mode = RUN_MODE if running else ""
        if running:
            tracked_log_path = RUN_LOG_PATH
        if not running:
            state_pid, state_mode, state_log_path = read_running_state()
            if state_pid is not None:
                running = True
                run_mode = state_mode
                tracked_log_path = state_log_path

    status: Dict[str, Any] = {
        "running": running,
        "run_mode": run_mode,
        "loop_running": running and run_mode == "loop",
        "loop_next_check_in_seconds": None,
        "phase": "idle",
        "message": "等待任务启动",
        "available_candidates": None,
        "available_candidates_error": "",
        "completed": 0,
        "total": 0,
        "percent": 0,
        "stats": [
            {"label": "成功", "value": 0, "icon": "☑", "tone": "success"},
            {"label": "失败", "value": 0, "icon": "✕", "tone": "danger"},
            {"label": "剩余", "value": 0, "icon": "⏳", "tone": "pending"},
        ],
        "single_account_timing": {
            "latest_reg_seconds": None,
            "latest_oauth_seconds": None,
            "latest_total_seconds": None,
            "recent_avg_reg_seconds": None,
            "recent_avg_oauth_seconds": None,
            "recent_avg_total_seconds": None,
            "recent_slow_count": 0,
            "sample_size": 0,
            "window_size": 20,
        },
        "logs": [],
        "last_log_path": "",
    }

    latest_log: Optional[Path] = None
    if tracked_log_path:
        tracked_path = Path(tracked_log_path)
        if tracked_path.exists():
            latest_log = tracked_path

    if latest_log is None:
        latest_log = get_latest_log_path()
    if latest_log is None:
        status["logs"] = [
            {
                "id": "log-empty",
                "prefix": "[系统]",
                "timestamp": "[--:--:--]",
                "message": "暂无运行日志",
                "tone": "muted",
            }
        ]
        return status

    try:
        config = load_config()
        base_url = str(((config.get("clean") or {}).get("base_url")) or "").rstrip("/")
        token = str(((config.get("clean") or {}).get("token")) or "").strip()
        target_type = str(((config.get("clean") or {}).get("target_type")) or "codex")
        timeout = int(((config.get("clean") or {}).get("timeout")) or 10)
        if base_url and token:
            _, available_candidates = get_candidates_count(
                base_url=base_url,
                token=token,
                target_type=target_type,
                timeout=timeout,
            )
            status["available_candidates"] = available_candidates
    except Exception as e:
        status["available_candidates_error"] = str(e)

    status["last_log_path"] = str(latest_log)
    raw_lines = tail_lines(latest_log)
    status["logs"] = [parse_log_line(index, line) for index, line in enumerate(raw_lines, start=1)]
    status["single_account_timing"] = build_single_account_timing(raw_lines, window_size=20)
    if status.get("loop_running"):
        status["loop_next_check_in_seconds"] = parse_loop_next_check_in_seconds(raw_lines)

    round_start_pattern = re.compile(r">>> 循环轮次 #\d+ 开始")
    scan_lines = raw_lines
    last_round_start_index: Optional[int] = None
    for index, line in enumerate(raw_lines):
        if round_start_pattern.search(line):
            last_round_start_index = index
    if last_round_start_index is not None:
        scan_lines = raw_lines[last_round_start_index:]

    progress_patterns = [
        re.compile(r"补号进度: token (?P<success>\d+)/(?P<total>\d+) \| ✅(?P<ok>\d+) ❌(?P<fail>\d+) ⏭️(?P<skip>\d+)"),
        re.compile(r"补号完成: token=(?P<success>\d+)/(?P<total>\d+), fail=(?P<fail>\d+), skip=(?P<skip>\d+)"),
    ]
    start_pattern = re.compile(r"开始补号: 目标 token=(?P<total>\d+)")

    success = 0
    failed = 0
    skipped = 0
    total = 0

    for line in reversed(scan_lines):
        for pattern in progress_patterns:
            matched = pattern.search(line)
            if matched:
                success = int(matched.group("success"))
                failed = int(matched.group("fail"))
                skipped = int(matched.group("skip"))
                total = int(matched.group("total"))
                break
        if total:
            break

    if total == 0:
        for line in reversed(scan_lines):
            matched = start_pattern.search(line)
            if matched:
                total = int(matched.group("total"))
                break

    completed = success
    remaining = max(total - success, 0) if total else 0
    percent = int((success / total) * 100) if total else 0

    status["completed"] = completed
    status["total"] = total
    status["percent"] = percent
    status["stats"] = [
        {"label": "成功", "value": success, "icon": "☑", "tone": "success"},
        {"label": "失败", "value": failed, "icon": "✕", "tone": "danger"},
        {"label": "剩余", "value": remaining, "icon": "⏳", "tone": "pending"},
    ]

    if raw_lines:
        last_message = raw_lines[-1]
        has_batch_start = "开始补号" in "\n".join(scan_lines)

        if status["running"]:
            if status.get("loop_running"):
                status["phase"] = "looping"
                status["message"] = "循环补号运行中"
            else:
                status["phase"] = "maintaining"
                status["message"] = "补号任务运行中" if has_batch_start else "维护任务运行中"
        elif "=== 账号池自动维护结束（成功）===" in last_message:
            status["phase"] = "completed"
            status["message"] = "最近一次维护已完成"
        elif "=== 账号池自动维护结束（失败）===" in last_message:
            status["phase"] = "failed"
            status["message"] = "最近一次维护失败"
        elif has_batch_start:
            status["message"] = "最近一次维护已停止，日志未写入结束标记"
        else:
            status["message"] = "已加载最近一次运行日志"

    return status


def _safe_read_json(path: Path) -> Dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}
    return payload if isinstance(payload, dict) else {}


def _normalize_account_key(value: Any) -> str:
    text = re.sub(r"[^0-9A-Za-z._@-]+", "_", str(value or "").strip().lower())
    text = re.sub(r"_+", "_", text).strip("._-")
    return text or "unknown_account"


def _resolve_account_key(path: Path) -> str:
    payload = _safe_read_json(path)
    candidates = [
        payload.get("email"),
        payload.get("account_id"),
        ((payload.get("extra") or {}) if isinstance(payload.get("extra"), dict) else {}).get("email"),
        ((payload.get("credentials") or {}) if isinstance(payload.get("credentials"), dict) else {}).get("chatgpt_account_id"),
    ]
    for candidate in candidates:
        text = str(candidate or "").strip()
        if text:
            return _normalize_account_key(text)
    return _normalize_account_key(path.stem)


def iter_batch_source_json_files() -> List[Path]:
    ensure_runtime_paths()
    files: List[Path] = []
    if not OUTPUT_TOKENS_DIR.exists():
        return files
    for path in OUTPUT_TOKENS_DIR.rglob("*.json"):
        try:
            relative_parts = path.relative_to(OUTPUT_TOKENS_DIR).parts
        except Exception:
            continue
        if not relative_parts:
            continue
        if relative_parts[0] in {"cpa", "subapi"}:
            continue
        files.append(path)
    files.sort(key=lambda item: item.stat().st_mtime if item.exists() else 0, reverse=True)
    return files


def sync_output_inventory_formats() -> Dict[str, int]:
    ensure_runtime_paths()
    cpa_dir = OUTPUT_TOKENS_DIR / "cpa"
    subapi_dir = OUTPUT_TOKENS_DIR / "subapi"
    cpa_dir.mkdir(parents=True, exist_ok=True)
    subapi_dir.mkdir(parents=True, exist_ok=True)

    cpa_written = 0
    subapi_written = 0

    for source_path in iter_batch_source_json_files():
        payload = _safe_read_json(source_path)
        if not payload:
            continue

        account_key = _resolve_account_key(source_path)

        cpa_payload = build_cpa_payload(payload)
        if cpa_payload is not None:
            target_path = cpa_dir / f"{account_key}.json"
            target_path.write_text(json.dumps(cpa_payload, ensure_ascii=False, indent=2), encoding="utf-8")
            cpa_written += 1

        subapi_payload = build_sub2api_payload(payload)
        if subapi_payload is not None:
            target_path = subapi_dir / f"{account_key}.json"
            target_path.write_text(json.dumps(subapi_payload, ensure_ascii=False, indent=2), encoding="utf-8")
            subapi_written += 1

    return {"cpa_written": cpa_written, "subapi_written": subapi_written}


def _scan_output_format_dir(source: str, path: Path) -> Dict[str, Any]:
    items: List[Dict[str, Any]] = []
    account_keys: set[str] = set()
    if path.exists() and path.is_dir():
        for file_path in sorted(path.glob("*.json")):
            try:
                stat = file_path.stat()
            except Exception:
                continue
            account_key = _resolve_account_key(file_path)
            account_keys.add(account_key)
            items.append(
                {
                    "id": f"{source}:{file_path.name}",
                    "source": source,
                    "file_name": file_path.name,
                    "account_key": account_key,
                    "updated_at": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                    "size": int(stat.st_size),
                    "path": str(file_path),
                }
            )

    items.sort(key=lambda item: item["updated_at"], reverse=True)
    return {
        "exists": path.exists() and path.is_dir(),
        "path": str(path),
        "file_count": len(items),
        "account_keys": sorted(account_keys),
        "recent_files": items[:12],
    }


def build_output_inventory_status() -> Dict[str, Any]:
    ensure_runtime_paths()
    sync_output_inventory_formats()
    cpa_dir = OUTPUT_TOKENS_DIR / "cpa"
    subapi_dir = OUTPUT_TOKENS_DIR / "subapi"
    cpa_status = _scan_output_format_dir("cpa", cpa_dir)
    subapi_status = _scan_output_format_dir("subapi", subapi_dir)
    unique_account_keys = sorted(set(cpa_status["account_keys"]) | set(subapi_status["account_keys"]))
    paired_account_keys = sorted(set(cpa_status["account_keys"]) & set(subapi_status["account_keys"]))
    recent_files = sorted(
        [*cpa_status["recent_files"], *subapi_status["recent_files"]],
        key=lambda item: item["updated_at"],
        reverse=True,
    )[:16]
    last_updated_at = recent_files[0]["updated_at"] if recent_files else None

    return {
        "root_path": str(OUTPUT_TOKENS_DIR),
        "batch_shell_enabled": True,
        "formats": {
            "cpa": {
                "exists": cpa_status["exists"],
                "path": cpa_status["path"],
                "file_count": cpa_status["file_count"],
            },
            "subapi": {
                "exists": subapi_status["exists"],
                "path": subapi_status["path"],
                "file_count": subapi_status["file_count"],
            },
        },
        "unique_account_count": len(unique_account_keys),
        "paired_account_count": len(paired_account_keys),
        "last_updated_at": last_updated_at,
        "recent_files": recent_files,
    }


def build_output_archive() -> tuple[bytes, str]:
    ensure_runtime_paths()
    sync_output_inventory_formats()
    archive_name = f"output_tokens_{datetime.now().strftime('%Y%m%d_%H%M%S')}.zip"
    buffer = io.BytesIO()

    with zipfile.ZipFile(buffer, mode="w", compression=zipfile.ZIP_DEFLATED) as archive:
        written = 0
        for folder_name in ("cpa", "subapi"):
            folder_path = OUTPUT_TOKENS_DIR / folder_name
            if not folder_path.exists() or not folder_path.is_dir():
                continue
            for json_path in sorted(folder_path.glob("*.json")):
                if not json_path.is_file():
                    continue
                archive.write(json_path, arcname=f"{folder_name}/{json_path.name}")
                written += 1

        if written == 0:
            archive.writestr(
                "README.txt",
                "No output JSON files were found in cpa/ or subapi/ at archive creation time.\n",
            )

    return buffer.getvalue(), archive_name


def clear_output_inventory() -> Dict[str, Any]:
    ensure_runtime_paths()
    batch_pid, _, _, _ = read_batch_running_state()
    if batch_pid is not None:
        return {"ok": False, "cleared": False, "message": "批处理任务运行中，请先停止后再清空目录"}

    deleted_files = 0
    deleted_dirs = 0
    for child in list(OUTPUT_TOKENS_DIR.iterdir()):
        try:
            if child.is_dir():
                deleted_files += sum(1 for item in child.rglob("*") if item.is_file())
                shutil.rmtree(child)
                deleted_dirs += 1
            else:
                child.unlink(missing_ok=True)
                deleted_files += 1
        except Exception as exc:
            return {
                "ok": False,
                "cleared": False,
                "message": f"清空输出目录失败: {exc}",
            }

    (OUTPUT_TOKENS_DIR / "cpa").mkdir(parents=True, exist_ok=True)
    (OUTPUT_TOKENS_DIR / "subapi").mkdir(parents=True, exist_ok=True)
    return {
        "ok": True,
        "cleared": True,
        "deleted_files": deleted_files,
        "deleted_dirs": deleted_dirs,
        "message": f"已清空批处理输出目录，删除文件 {deleted_files} 个，目录 {deleted_dirs} 个",
    }


def start_maintainer_process(*, loop_mode: bool = False) -> Dict[str, Any]:
    global RUN_PROCESS, RUN_MODE, RUN_LOG_PATH

    with RUN_PROCESS_LOCK:
        batch_pid, _, _, _ = read_batch_running_state()
        if batch_pid is not None:
            return {"ok": False, "started": False, "message": "批处理任务运行中，请先停止批处理"}
        if RUN_PROCESS is not None and RUN_PROCESS.poll() is None:
            return {"ok": True, "started": False, "message": "维护任务已在运行中"}
        state_pid, state_mode, state_log_path = read_running_state()
        if state_pid is not None:
            RUN_MODE = state_mode
            RUN_LOG_PATH = state_log_path
            return {
                "ok": True,
                "started": False,
                "pid": state_pid,
                "mode": state_mode,
                "message": "维护任务已在运行中",
            }

        process_env = os.environ.copy()
        process_env["APP_DATA_DIR"] = str(APP_DATA_DIR)
        process_env["APP_CONFIG_PATH"] = str(CONFIG_PATH)
        process_env["APP_LOG_DIR"] = str(LOGS_DIR)
        planned_log_path = LOGS_DIR / f"pool_maintainer_{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}.log"
        process_env["APP_LOG_FILE"] = str(planned_log_path)

        command = [sys.executable, str(PROJECT_ROOT / "auto_pool_maintainer.py")]
        if loop_mode:
            command.append("--loop")
        popen_kwargs: Dict[str, Any] = {}
        if IS_WINDOWS:
            popen_kwargs["creationflags"] = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
        else:
            popen_kwargs["start_new_session"] = True
        RUN_PROCESS = subprocess.Popen(
            command,
            cwd=str(APP_DATA_DIR),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            text=True,
            env=process_env,
            **popen_kwargs,
        )
        time.sleep(0.3)
        if RUN_PROCESS.poll() is not None:
            exit_code = RUN_PROCESS.returncode
            RUN_PROCESS = None
            RUN_MODE = ""
            RUN_LOG_PATH = ""
            clear_run_state()
            return {
                "ok": False,
                "started": False,
                "message": f"维护任务启动失败（进程已退出，code={exit_code}）",
            }

        RUN_MODE = "loop" if loop_mode else "single"
        RUN_LOG_PATH = str(planned_log_path)
        save_run_state(RUN_PROCESS.pid, RUN_MODE, RUN_LOG_PATH)
        return {
            "ok": True,
            "started": True,
            "pid": RUN_PROCESS.pid,
            "mode": RUN_MODE,
            "message": "已启动循环补号任务" if loop_mode else "已启动维护任务",
        }


def stop_maintainer_process() -> Dict[str, Any]:
    global RUN_PROCESS, RUN_MODE, RUN_LOG_PATH

    with RUN_PROCESS_LOCK:
        if RUN_PROCESS is not None and RUN_PROCESS.poll() is None:
            target_pid = RUN_PROCESS.pid
            try:
                stopped = terminate_process_handle(RUN_PROCESS, timeout_seconds=8.0)
            except Exception as e:
                return {"ok": False, "stopped": False, "message": f"停止维护任务失败: {e}"}
            if not stopped:
                return {"ok": False, "stopped": False, "message": f"停止维护任务失败: pid={target_pid}"}
            RUN_PROCESS = None
            RUN_MODE = ""
            RUN_LOG_PATH = ""
            clear_run_state()
            return {"ok": True, "stopped": True, "pid": target_pid, "message": "已停止维护任务"}

        state_pid, state_mode, state_log_path = read_running_state()
        if state_pid is None:
            RUN_PROCESS = None
            RUN_MODE = ""
            RUN_LOG_PATH = ""
            clear_run_state()
            return {"ok": True, "stopped": False, "message": "当前没有运行中的维护任务"}
        target_pid = state_pid
        RUN_MODE = state_mode
        RUN_LOG_PATH = state_log_path

        try:
            if not terminate_pid(target_pid, timeout_seconds=8.0):
                return {"ok": False, "stopped": False, "message": f"停止维护任务失败: pid={target_pid}"}
        except Exception as e:
            return {"ok": False, "stopped": False, "message": f"停止维护任务失败: {e}"}

        RUN_PROCESS = None
        RUN_MODE = ""
        RUN_LOG_PATH = ""
        clear_run_state()

        return {"ok": True, "stopped": True, "pid": target_pid, "message": "已停止维护任务"}


def get_latest_batch_log_path() -> Optional[Path]:
    return get_latest_log_path("pool_batch_*.log")


def build_batch_status() -> Dict[str, Any]:
    tracked_log_path = ""
    target_count = 0
    with BATCH_PROCESS_LOCK:
        process = BATCH_PROCESS
        running = process is not None and process.poll() is None
        batch_mode = BATCH_MODE if running else ""
        if running:
            tracked_log_path = BATCH_LOG_PATH
            target_count = BATCH_TARGET_COUNT
        if not running:
            state_pid, state_mode, state_log_path, state_target_count = read_batch_running_state()
            if state_pid is not None:
                running = True
                batch_mode = state_mode
                tracked_log_path = state_log_path
                target_count = state_target_count

    status: Dict[str, Any] = {
        "running": running,
        "run_mode": batch_mode,
        "phase": "idle",
        "message": "等待批处理任务启动",
        "target_count": target_count,
        "completed": 0,
        "total": target_count,
        "percent": 0,
        "stats": [
            {"label": "成功", "value": 0, "icon": "☑", "tone": "success"},
            {"label": "失败", "value": 0, "icon": "✕", "tone": "danger"},
            {"label": "剩余", "value": max(target_count, 0), "icon": "⏳", "tone": "pending"},
        ],
        "logs": [],
        "last_log_path": "",
        "output_inventory": build_output_inventory_status(),
    }

    latest_log: Optional[Path] = None
    if tracked_log_path:
        tracked_path = Path(tracked_log_path)
        if tracked_path.exists():
            latest_log = tracked_path
    if latest_log is None:
        latest_log = get_latest_batch_log_path()
    if latest_log is None:
        status["logs"] = [
            {
                "id": "batch-log-empty",
                "prefix": "[系统]",
                "timestamp": "[--:--:--]",
                "message": "暂无批处理日志",
                "tone": "muted",
            }
        ]
        return status

    status["last_log_path"] = str(latest_log)
    raw_lines = tail_lines(latest_log)
    status["logs"] = [parse_log_line(index, line) for index, line in enumerate(raw_lines, start=1)]

    progress_patterns = [
        re.compile(r"补号进度: token (?P<success>\d+)/(?P<total>\d+) \| ✅(?P<ok>\d+) ❌(?P<fail>\d+) ⏭️(?P<skip>\d+)"),
        re.compile(r"补号完成: token=(?P<success>\d+)/(?P<total>\d+), fail=(?P<fail>\d+), skip=(?P<skip>\d+)"),
    ]
    start_pattern = re.compile(r"开始补号: 目标 token=(?P<total>\d+)")

    success = 0
    failed = 0
    total = max(target_count, 0)
    for line in reversed(raw_lines):
        matched_any = False
        for pattern in progress_patterns:
            matched = pattern.search(line)
            if matched:
                success = int(matched.group("success"))
                failed = int(matched.group("fail"))
                total = int(matched.group("total"))
                matched_any = True
                break
        if matched_any:
            break

    if total == 0:
        for line in reversed(raw_lines):
            matched = start_pattern.search(line)
            if matched:
                total = int(matched.group("total"))
                break

    completed = success
    remaining = max(total - success, 0) if total else 0
    percent = int((success / total) * 100) if total else 0
    status["target_count"] = total
    status["completed"] = completed
    status["total"] = total
    status["percent"] = percent
    status["stats"] = [
        {"label": "成功", "value": success, "icon": "☑", "tone": "success"},
        {"label": "失败", "value": failed, "icon": "✕", "tone": "danger"},
        {"label": "剩余", "value": remaining, "icon": "⏳", "tone": "pending"},
    ]

    if raw_lines:
        last_message = raw_lines[-1]
        has_batch_start = any("=== 独立批处理任务开始 ===" in line for line in raw_lines) or any("开始补号:" in line for line in raw_lines)

        if status["running"]:
            status["phase"] = "running"
            status["message"] = "批处理任务运行中"
        elif "=== 独立批处理任务结束（成功）===" in last_message:
            status["phase"] = "completed"
            status["message"] = "最近一次批处理已完成"
        elif "=== 独立批处理任务结束（失败）===" in last_message:
            status["phase"] = "failed"
            status["message"] = "最近一次批处理失败"
        elif has_batch_start:
            status["phase"] = "stopped"
            status["message"] = "最近一次批处理已停止，日志未写入结束标记"
        else:
            status["message"] = "已加载最近一次批处理日志"

    return status


def start_batch_process(target_count: int) -> Dict[str, Any]:
    global BATCH_PROCESS, BATCH_MODE, BATCH_LOG_PATH, BATCH_TARGET_COUNT

    target_count = int(target_count or 0)
    if target_count <= 0:
        return {"ok": False, "started": False, "message": "批处理目标数量必须大于 0"}

    with BATCH_PROCESS_LOCK:
        state_pid, _, _ = read_running_state()
        if state_pid is not None:
            return {"ok": False, "started": False, "message": "维护任务运行中，请先停止维护任务"}
        if BATCH_PROCESS is not None and BATCH_PROCESS.poll() is None:
            return {"ok": True, "started": False, "message": "批处理任务已在运行中"}
        state_pid, state_mode, state_log_path, state_target = read_batch_running_state()
        if state_pid is not None:
            BATCH_MODE = state_mode
            BATCH_LOG_PATH = state_log_path
            BATCH_TARGET_COUNT = state_target
            return {
                "ok": True,
                "started": False,
                "pid": state_pid,
                "mode": state_mode,
                "target_count": state_target,
                "message": "批处理任务已在运行中",
            }

        process_env = os.environ.copy()
        process_env["APP_DATA_DIR"] = str(APP_DATA_DIR)
        process_env["APP_CONFIG_PATH"] = str(CONFIG_PATH)
        process_env["APP_LOG_DIR"] = str(LOGS_DIR)
        planned_log_path = LOGS_DIR / f"pool_batch_{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}.log"
        process_env["APP_LOG_FILE"] = str(planned_log_path)

        command = [sys.executable, str(PROJECT_ROOT / "auto_pool_maintainer.py"), "--batch-target", str(target_count)]
        popen_kwargs: Dict[str, Any] = {}
        if IS_WINDOWS:
            popen_kwargs["creationflags"] = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
        else:
            popen_kwargs["start_new_session"] = True
        BATCH_PROCESS = subprocess.Popen(
            command,
            cwd=str(APP_DATA_DIR),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            text=True,
            env=process_env,
            **popen_kwargs,
        )
        time.sleep(0.3)
        if BATCH_PROCESS.poll() is not None:
            exit_code = BATCH_PROCESS.returncode
            BATCH_PROCESS = None
            BATCH_MODE = ""
            BATCH_LOG_PATH = ""
            BATCH_TARGET_COUNT = 0
            clear_batch_run_state()
            return {
                "ok": False,
                "started": False,
                "message": f"批处理任务启动失败（进程已退出，code={exit_code}）",
            }

        BATCH_MODE = "batch"
        BATCH_LOG_PATH = str(planned_log_path)
        BATCH_TARGET_COUNT = target_count
        save_batch_run_state(BATCH_PROCESS.pid, BATCH_MODE, BATCH_LOG_PATH, BATCH_TARGET_COUNT)
        return {
            "ok": True,
            "started": True,
            "pid": BATCH_PROCESS.pid,
            "mode": BATCH_MODE,
            "target_count": BATCH_TARGET_COUNT,
            "message": "已启动批处理任务",
        }


def stop_batch_process() -> Dict[str, Any]:
    global BATCH_PROCESS, BATCH_MODE, BATCH_LOG_PATH, BATCH_TARGET_COUNT

    with BATCH_PROCESS_LOCK:
        if BATCH_PROCESS is not None and BATCH_PROCESS.poll() is None:
            target_pid = BATCH_PROCESS.pid
            try:
                stopped = terminate_process_handle(BATCH_PROCESS, timeout_seconds=8.0)
            except Exception as e:
                return {"ok": False, "stopped": False, "message": f"停止批处理任务失败: {e}"}
            if not stopped:
                return {"ok": False, "stopped": False, "message": f"停止批处理任务失败: pid={target_pid}"}
            BATCH_PROCESS = None
            BATCH_MODE = ""
            BATCH_LOG_PATH = ""
            BATCH_TARGET_COUNT = 0
            clear_batch_run_state()
            return {"ok": True, "stopped": True, "pid": target_pid, "message": "已停止批处理任务"}

        state_pid, state_mode, state_log_path, state_target = read_batch_running_state()
        if state_pid is None:
            BATCH_PROCESS = None
            BATCH_MODE = ""
            BATCH_LOG_PATH = ""
            BATCH_TARGET_COUNT = 0
            clear_batch_run_state()
            return {"ok": True, "stopped": False, "message": "当前没有运行中的批处理任务"}

        BATCH_MODE = state_mode
        BATCH_LOG_PATH = state_log_path
        BATCH_TARGET_COUNT = state_target
        target_pid = state_pid
        try:
            if not terminate_pid(target_pid, timeout_seconds=8.0):
                return {"ok": False, "stopped": False, "message": f"停止批处理任务失败: pid={target_pid}"}
        except Exception as e:
            return {"ok": False, "stopped": False, "message": f"停止批处理任务失败: {e}"}

        BATCH_PROCESS = None
        BATCH_MODE = ""
        BATCH_LOG_PATH = ""
        BATCH_TARGET_COUNT = 0
        clear_batch_run_state()
        return {"ok": True, "stopped": True, "pid": target_pid, "message": "已停止批处理任务"}


class ApiHandler(BaseHTTPRequestHandler):
    server_version = "AutoPoolMaintainerAPI/0.1"

    def _send_json(self, payload: Any, status: int = HTTPStatus.OK) -> None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        origin = self.headers.get("Origin", "")
        if origin:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Admin-Token")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()
        self.wfile.write(data)

    def _send_bytes(
        self,
        payload: bytes,
        *,
        content_type: str,
        filename: Optional[str] = None,
        status: int = HTTPStatus.OK,
    ) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        if filename:
            self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
        origin = self.headers.get("Origin", "")
        if origin:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Admin-Token")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Expose-Headers", "Content-Disposition")
        self.end_headers()
        self.wfile.write(payload)

    def _read_json_body(self) -> Dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0") or "0")
        raw = self.rfile.read(length) if length > 0 else b"{}"
        data = json.loads(raw.decode("utf-8") or "{}")
        if not isinstance(data, dict):
            raise RuntimeError("请求体必须是 JSON 对象")
        return data

    def _send_unauthorized(self, message: str = "Unauthorized") -> None:
        self._send_json({"error": message}, status=HTTPStatus.UNAUTHORIZED)

    def _is_authorized(self) -> bool:
        expected = get_admin_token()
        incoming = self.headers.get("X-Admin-Token", "").strip()
        return incoming == expected

    def _require_auth(self) -> bool:
        if self.path == "/api/health":
            return True
        if self._is_authorized():
            return True
        self._send_unauthorized("Invalid or missing X-Admin-Token")
        return False

    def do_OPTIONS(self) -> None:
        self._send_json({"ok": True})

    def do_GET(self) -> None:
        if not self._require_auth():
            return
        if self.path == "/api/config":
            self._send_json(mask_sensitive_config(load_config()))
            return
        if self.path == "/api/output/download":
            archive_bytes, archive_name = build_output_archive()
            self._send_bytes(
                archive_bytes,
                content_type="application/zip",
                filename=archive_name,
            )
            return
        if self.path == "/api/output/status":
            self._send_json(build_output_inventory_status())
            return
        if self.path == "/api/batch/status":
            self._send_json(build_batch_status())
            return
        if self.path == "/api/runtime/status":
            self._send_json(build_runtime_status())
            return
        if self.path == "/api/health":
            self._send_json({"ok": True, "time": datetime.now().isoformat()})
            return
        self._send_json({"error": "Not Found"}, status=HTTPStatus.NOT_FOUND)

    def do_POST(self) -> None:
        if not self._require_auth():
            return
        if self.path == "/api/config":
            payload = self._read_json_body()
            save_config(payload)
            self._send_json(mask_sensitive_config(load_config()))
            return
        if self.path == "/api/admin/token":
            try:
                payload = self._read_json_body()
                result = update_admin_token(payload.get("token"))
            except ValueError as exc:
                result = {"ok": False, "updated": False, "read_only": False, "message": str(exc)}
            except Exception as exc:
                result = {"ok": False, "updated": False, "read_only": False, "message": f"更新登录页密码失败: {exc}"}
            self._send_json(result)
            return
        if self.path == "/api/mail/domain-registry/check":
            payload = self._read_json_body()
            self._send_json(
                check_mail_domain_registry(
                    payload.get("provider"),
                    payload.get("api_base"),
                    payload.get("api_key"),
                )
            )
            return
        if self.path == "/api/runtime/start":
            self._send_json(start_maintainer_process())
            return
        if self.path == "/api/runtime/start-loop":
            self._send_json(start_maintainer_process(loop_mode=True))
            return
        if self.path == "/api/runtime/stop":
            self._send_json(stop_maintainer_process())
            return
        if self.path == "/api/batch/start":
            payload = self._read_json_body()
            target_count = int(payload.get("target_count") or 0)
            self._send_json(start_batch_process(target_count))
            return
        if self.path == "/api/batch/stop":
            self._send_json(stop_batch_process())
            return
        if self.path == "/api/output/clear":
            self._send_json(clear_output_inventory())
            return
        self._send_json({"error": "Not Found"}, status=HTTPStatus.NOT_FOUND)

    def log_message(self, format: str, *args: Any) -> None:
        return


def run_server(host: str = API_HOST, port: int = API_PORT) -> None:
    ensure_runtime_paths()
    _ = get_admin_token()
    if ADMIN_TOKEN_ENV:
        print("Using APP_ADMIN_TOKEN from environment.")
    else:
        print(f"Admin token file: {ADMIN_TOKEN_FILE}")
        print("Admin token loaded from file. The token value is no longer echoed to stdout.")
    server = ThreadingHTTPServer((host, port), ApiHandler)
    print(f"API server listening on http://{host}:{port}")
    server.serve_forever()


if __name__ == "__main__":
    run_server()
