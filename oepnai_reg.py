import json
import os
import re
import sys
import time
import uuid
import math
import random
import string
import secrets
import hashlib
import base64
import threading
import argparse
import urllib.parse as urllib_parse
from datetime import datetime, timezone, timedelta
from urllib.parse import urlparse, parse_qs, urlencode, quote
from dataclasses import dataclass
from typing import Any, Dict, Optional, Tuple
import urllib.parse
import urllib.request
import urllib.error

from curl_cffi import requests, CurlMime

try:
    from proxy_pool import load_proxy_pool, choose_proxy, build_requests_proxies
except Exception:
    load_proxy_pool = None
    choose_proxy = None
    build_requests_proxies = None

# ==========================================
# Tempmail.lol API (v2)/渗透云记 b.encenc.com
# ==========================================

TEMPMAIL_BASE = "https://api.tempmail.lol/v2"


def get_email_and_token(proxies: Any = None) -> tuple[str, str]:
    """创建 Tempmail.lol 邮箱并获取 token"""
    try:
        # 创建新的 inbox
        resp = requests.post(
            f"{TEMPMAIL_BASE}/inbox/create",
            headers={
                "Accept": "application/json",
                "Content-Type": "application/json",
            },
            json={},
            proxies=proxies,
            impersonate="chrome",
            timeout=15,
        )

        if resp.status_code not in (200, 201):
            print(f"[Error] Tempmail.lol 请求失败，状态码: {resp.status_code}")
            return "", ""

        data = resp.json()
        email = str(data.get("address", "")).strip()
        token = str(data.get("token", "")).strip()

        if not email or not token:
            print("[Error] Tempmail.lol 返回数据不完整")
            return "", ""

        return email, token

    except Exception as e:
        print(f"[Error] 创建 Tempmail.lol 邮箱出错: {e}")
        return "", ""


def get_oai_code(token: str, email: str, proxies: Any = None, seen_ids: Optional[set] = None) -> str:
    """使用 Tempmail.lol token 轮询获取验证码
    Args:
        seen_ids: 可选的已处理邮件ID集合，用于避免重复处理。如果为None，则内部创建新集合。
    """
    regex = r"(?<!\d)(\d{6})(?!\d)"
    if seen_ids is None:
        seen_ids = set()

    print(f"[*] 正在等待邮箱 {email} 的验证码...", end="", flush=True)

    for _ in range(40):
        print(".", end="", flush=True)
        try:
            # 获取邮件列表
            resp = requests.get(
                f"{TEMPMAIL_BASE}/inbox",
                params={"token": token},
                headers={"Accept": "application/json"},
                proxies=proxies,
                impersonate="chrome",
                timeout=15,
            )

            if resp.status_code != 200:
                time.sleep(3)
                continue

            data = resp.json()

            # 检查 inbox 是否过期
            if data is None or (isinstance(data, dict) and not data):
                print(" 邮箱已过期")
                return ""

            email_list = data.get("emails", []) if isinstance(data, dict) else []

            if not isinstance(email_list, list):
                time.sleep(3)
                continue

            for msg in email_list:
                if not isinstance(msg, dict):
                    continue

                # 使用邮件ID作为唯一标识，如果不存在则使用 date
                msg_id = msg.get("id") or msg.get("date", 0)
                if not msg_id or msg_id in seen_ids:
                    continue
                seen_ids.add(msg_id)

                sender = str(msg.get("from", "")).lower()
                subject = str(msg.get("subject", ""))
                body = str(msg.get("body", ""))
                html = str(msg.get("html") or "")

                content = "\n".join([sender, subject, body, html])

                # 检查是否是目标邮件
                if "openai" not in sender and "openai" not in content.lower():
                    continue

                # 提取验证码
                m = re.search(regex, content)
                if m:
                    print(" 抓到啦! 验证码:", m.group(1))
                    return m.group(1)

        except Exception as e:
            pass

        time.sleep(3)

    print(" 超时，未收到验证码")
    return ""


# ==========================================
# OAuth 授权与辅助函数
# ==========================================

AUTH_URL = "https://auth.openai.com/oauth/authorize"
TOKEN_URL = "https://auth.openai.com/oauth/token"
CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann"

DEFAULT_REDIRECT_URI = f"http://localhost:1455/auth/callback"
DEFAULT_SCOPE = "openid email profile offline_access"

# ==========================================
# 上传配置
# ==========================================

DEFAULT_UPLOAD_CONFIG = {
    "enabled": True,
    "url": "http://142.171.185.94:8317/v0/management/auth-files",
    "authorization": "Bearer 2221220663Gzj?",
    "auth_type": "bearer",  # bearer | basic | raw
    "username": "",
    "password": "",
    "timeout": 30,
    "headers": {
        "Accept": "application/json, text/plain, */*",
    },
}


def _parse_bool(v: Any, default: bool = False) -> bool:
    if v is None:
        return default
    if isinstance(v, bool):
        return v
    s = str(v).strip().lower()
    if s in {"1", "true", "yes", "y", "on"}:
        return True
    if s in {"0", "false", "no", "n", "off"}:
        return False
    return default


def _load_headers_from_env() -> Dict[str, str]:
    """支持两种方式：
    1) UPLOAD_HEADERS_JSON='{"Accept":"...","X-Token":"..."}'
    2) UPLOAD_HEADER_ACCEPT='...'
       UPLOAD_HEADER_X_TOKEN='...'
    """
    result: Dict[str, str] = {}

    raw_json = os.getenv("UPLOAD_HEADERS_JSON", "").strip()
    if raw_json:
        try:
            parsed = json.loads(raw_json)
            if isinstance(parsed, dict):
                for k, v in parsed.items():
                    if v is not None:
                        result[str(k)] = str(v)
        except Exception as e:
            print(f"[Warn] UPLOAD_HEADERS_JSON 解析失败，已忽略: {e}")

    prefix = "UPLOAD_HEADER_"
    for key, value in os.environ.items():
        if not key.startswith(prefix) or value is None:
            continue
        header_name = key[len(prefix):].strip()
        if not header_name:
            continue
        header_name = header_name.replace("__", "-").replace("_", "-")
        result[header_name] = str(value)

    return result


def _normalize_upload_config(config: Dict[str, Any]) -> Dict[str, Any]:
    config["enabled"] = _parse_bool(config.get("enabled", True), True)
    config["url"] = str(config.get("url", "")).strip()

    config["auth_type"] = str(config.get("auth_type", "bearer")).strip().lower() or "bearer"
    config["username"] = str(config.get("username", "")).strip()
    config["password"] = str(config.get("password", "")).strip()

    authorization = str(config.get("authorization", "")).strip()
    if authorization and config["auth_type"] == "bearer" and not authorization.lower().startswith("bearer "):
        authorization = f"Bearer {authorization}"
    config["authorization"] = authorization

    try:
        timeout = int(config.get("timeout", 30))
    except Exception:
        timeout = 30
    config["timeout"] = max(5, timeout)

    headers = config.get("headers")
    if not isinstance(headers, dict):
        headers = {}
    config["headers"] = {str(k): str(v) for k, v in headers.items() if v is not None}

    return config


def _build_authorization(upload_cfg: Dict[str, Any]) -> str:
    auth_type = str(upload_cfg.get("auth_type", "bearer")).strip().lower()
    explicit_auth = str(upload_cfg.get("authorization", "")).strip()

    if auth_type == "basic":
        username = str(upload_cfg.get("username", "")).strip()
        password = str(upload_cfg.get("password", "")).strip()
        if username or password:
            token = base64.b64encode(f"{username}:{password}".encode("utf-8")).decode("ascii")
            return f"Basic {token}"
        return explicit_auth

    if auth_type == "raw":
        return explicit_auth

    # 默认 bearer 模式
    if explicit_auth and not explicit_auth.lower().startswith("bearer "):
        return f"Bearer {explicit_auth}"
    return explicit_auth


def _b64url_no_pad(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _sha256_b64url_no_pad(s: str) -> str:
    return _b64url_no_pad(hashlib.sha256(s.encode("ascii")).digest())


def _random_state(nbytes: int = 16) -> str:
    return secrets.token_urlsafe(nbytes)


def _pkce_verifier() -> str:
    return secrets.token_urlsafe(64)


def _parse_callback_url(callback_url: str) -> Dict[str, str]:
    candidate = callback_url.strip()
    if not candidate:
        return {"code": "", "state": "", "error": "", "error_description": ""}

    if "://" not in candidate:
        if candidate.startswith("?"):
            candidate = f"http://localhost{candidate}"
        elif any(ch in candidate for ch in "/?#") or ":" in candidate:
            candidate = f"http://{candidate}"
        elif "=" in candidate:
            candidate = f"http://localhost/?{candidate}"

    parsed = urllib.parse.urlparse(candidate)
    query = urllib.parse.parse_qs(parsed.query, keep_blank_values=True)
    fragment = urllib.parse.parse_qs(parsed.fragment, keep_blank_values=True)

    for key, values in fragment.items():
        if key not in query or not query[key] or not (query[key][0] or "").strip():
            query[key] = values

    def get1(k: str) -> str:
        v = query.get(k, [""])
        return (v[0] or "").strip()

    code = get1("code")
    state = get1("state")
    error = get1("error")
    error_description = get1("error_description")

    if code and not state and "#" in code:
        code, state = code.split("#", 1)

    if not error and error_description:
        error, error_description = error_description, ""

    return {
        "code": code,
        "state": state,
        "error": error,
        "error_description": error_description,
    }


def _jwt_claims_no_verify(id_token: str) -> Dict[str, Any]:
    if not id_token or id_token.count(".") < 2:
        return {}
    payload_b64 = id_token.split(".")[1]
    pad = "=" * ((4 - (len(payload_b64) % 4)) % 4)
    try:
        payload = base64.urlsafe_b64decode((payload_b64 + pad).encode("ascii"))
        return json.loads(payload.decode("utf-8"))
    except Exception:
        return {}


def _decode_jwt_segment(seg: str) -> Dict[str, Any]:
    raw = (seg or "").strip()
    if not raw:
        return {}
    pad = "=" * ((4 - (len(raw) % 4)) % 4)
    try:
        decoded = base64.urlsafe_b64decode((raw + pad).encode("ascii"))
        return json.loads(decoded.decode("utf-8"))
    except Exception:
        return {}


def _to_int(v: Any) -> int:
    try:
        return int(v)
    except (TypeError, ValueError):
        return 0


def _generate_password(length: int = 12) -> str:
    """生成指定长度的随机密码（包含大小写字母和数字）"""
    chars = string.ascii_letters + string.digits
    return ''.join(secrets.choice(chars) for _ in range(length))


def _mask_proxy_url(proxy_url: str) -> str:
    try:
        parsed = urllib.parse.urlparse(proxy_url)
        host = parsed.hostname or ""
        port = f":{parsed.port}" if parsed.port else ""
        if parsed.username:
            return f"{parsed.scheme}://{parsed.username}:***@{host}{port}"
        if parsed.scheme and host:
            return f"{parsed.scheme}://{host}{port}"
    except Exception:
        pass
    return proxy_url


def _build_proxy_url(scheme: str, host: str, port: int, username: str, password: str) -> str:
    scheme = (scheme or "http").strip().lower()
    if scheme not in ("http", "https"):
        raise ValueError("当前仅支持 http/https 代理协议")

    host = str(host or "").strip()
    if not host:
        raise ValueError("代理 host 不能为空")

    if int(port) <= 0:
        raise ValueError("代理 port 非法")

    user_enc = quote(str(username or "").strip(), safe='')
    pass_enc = quote(str(password or "").strip(), safe='')
    return f"{scheme}://{user_enc}:{pass_enc}@{host}:{int(port)}"


def _parse_kookeey_conn(raw_value: str, default_scheme: str = "http") -> str:
    raw = str(raw_value or "").strip()
    if not raw:
        raise ValueError("Kookeey 连接信息为空")

    if "://" in raw:
        return raw

    parts = raw.split(":", 3)
    if len(parts) != 4:
        raise ValueError("Kookeey 连接信息格式应为 host:port:username:password")

    host, port_text, username, password = parts
    return _build_proxy_url(default_scheme, host, int(port_text), username, password)


def _fetch_kookeey_pick_proxy(pick_url: str, default_scheme: str = "http", timeout: int = 15) -> str:
    url = str(pick_url or "").strip()
    if not url:
        raise ValueError("Kookeey 提取链接为空")

    req = urllib.request.Request(url, method="GET", headers={"Accept": "text/plain,application/json;q=0.9,*/*;q=0.8"})
    with urllib.request.urlopen(req, timeout=max(3, int(timeout))) as resp:
        raw = resp.read().decode("utf-8", "replace")

    normalized = raw.replace("\r", "\n")
    lines = [line.strip().strip("\"'") for line in normalized.split("\n") if line.strip()]
    if not lines:
        raise ValueError("Kookeey 提取接口返回为空")

    candidate = lines[0]
    lowered = candidate.lower()
    if lowered.startswith("http://") or lowered.startswith("https://"):
        return candidate

    if candidate.count(":") >= 3:
        return _parse_kookeey_conn(candidate, default_scheme=default_scheme)

    raise ValueError(f"无法识别的 Kookeey 提取结果: {candidate[:120]}")


def build_kookeey_proxy(
        *,
        proxy_url: Optional[str] = None,
        conn: Optional[str] = None,
        scheme: str = "http",
        pick_url: Optional[str] = None,
        pick_timeout: int = 15,
        host: Optional[str] = None,
        port: Optional[int] = None,
        line_username: Optional[str] = None,
        line_password: Optional[str] = None,
        user_id: Optional[str] = None,
        account: Optional[str] = None,
        password: Optional[str] = None,
        country: Optional[str] = None,
        session: Optional[str] = None,
        rotate: Optional[str] = None,
        session_len: int = 8,
) -> Tuple[Optional[str], Optional[str]]:
    manual_proxy = (proxy_url or "").strip()
    if manual_proxy:
        proxy = _parse_kookeey_conn(manual_proxy, default_scheme=scheme)
        return proxy, f"kookeey(manual) -> {_mask_proxy_url(proxy)}"

    raw_conn = (conn or "").strip()
    if raw_conn:
        proxy = _parse_kookeey_conn(raw_conn, default_scheme=scheme)
        return proxy, f"kookeey(conn) -> {_mask_proxy_url(proxy)}"

    raw_pick_url = (pick_url or "").strip()
    if raw_pick_url:
        proxy = _fetch_kookeey_pick_proxy(raw_pick_url, default_scheme=scheme, timeout=pick_timeout)
        return proxy, f"kookeey(api) -> {_mask_proxy_url(proxy)}"

    line_user = (line_username or "").strip()
    line_pass = (line_password or "").strip()
    host = str(host or "").strip()
    port_val = _to_int(port)

    if host and port_val > 0 and line_user and line_pass:
        proxy = _build_proxy_url(scheme, host, port_val, line_user, line_pass)
        return proxy, f"kookeey(line) -> {_mask_proxy_url(proxy)}"

    user_id = str(user_id or "").strip()
    account = str(account or "").strip()
    password = str(password or "").strip()
    country = str(country or "").strip().upper()
    rotate = str(rotate or "").strip()
    session = str(session or "").strip()

    if not (host and port_val > 0 and user_id and account and password):
        return None, None

    if not session:
        session_len = max(4, _to_int(session_len) or 8)
        session = ''.join(secrets.choice(string.digits) for _ in range(session_len))

    user_parts = [user_id, account]
    if session:
        user_parts.append(session)
    if rotate:
        user_parts.append(rotate)

    pass_parts = [password]
    if country:
        pass_parts.append(country)

    proxy = _build_proxy_url(scheme, host, port_val, '-'.join(user_parts), '-'.join(pass_parts))
    desc = f"kookeey({host}:{port_val}{', ' + country if country else ''}) -> {_mask_proxy_url(proxy)}"
    return proxy, desc


def resolve_proxy_settings(
        direct_proxy: Optional[str],
        proxy_config: Optional[str],
        proxy_strategy: str = "random",
        kookeey: Optional[Dict[str, Any]] = None,
) -> Tuple[Optional[str], Optional[Dict[str, str]], Optional[str]]:
    """解析代理设置，优先级：--proxy > Kookeey > --proxy-config。"""
    manual_proxy = (direct_proxy or "").strip()
    if manual_proxy:
        return manual_proxy, {"http": manual_proxy, "https": manual_proxy}, f"manual -> {_mask_proxy_url(manual_proxy)}"

    if kookeey:
        try:
            kookeey_proxy, kookeey_desc = build_kookeey_proxy(**kookeey)
            if kookeey_proxy:
                return kookeey_proxy, {"http": kookeey_proxy, "https": kookeey_proxy}, kookeey_desc
        except Exception as e:
            print(f"[Warn] Kookeey 代理构建失败: {e}")

    cfg_path = (proxy_config or "").strip()
    if not cfg_path:
        return None, None, None

    if not (load_proxy_pool and choose_proxy and build_requests_proxies):
        print("[Warn] proxy_pool 模块不可用，已跳过代理池配置")
        return None, None, None

    if not os.path.exists(cfg_path):
        print(f"[Warn] 代理池配置文件不存在: {cfg_path}")
        return None, None, None

    try:
        pool = load_proxy_pool(cfg_path)
        selected = choose_proxy(pool, proxy_strategy)
        proxy_url = selected.proxy_url()
        proxies = build_requests_proxies(selected)
        return proxy_url, proxies, f"{selected.name} -> {selected.masked_url()}"
    except Exception as e:
        print(f"[Warn] 读取代理池失败: {e}")
        return None, None, None


def _post_form(url: str, data: Dict[str, str], timeout: int = 30, proxy: Optional[str] = None) -> Dict[str, Any]:
    body = urllib.parse.urlencode(data).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json",
        },
    )
    if proxy:
        proxy_handler = urllib.request.ProxyHandler({'http': proxy, 'https': proxy})
        opener = urllib.request.build_opener(proxy_handler)
        try:
            with opener.open(req, timeout=timeout) as resp:
                raw = resp.read()
                if resp.status != 200:
                    raise RuntimeError(f"HTTP {resp.status}: {raw.decode('utf-8', 'replace')}")
                return json.loads(raw.decode("utf-8"))
        except urllib.error.HTTPError as exc:
            raw = exc.read()
            raise RuntimeError(f"HTTP {exc.code}: {raw.decode('utf-8', 'replace')}") from exc
    else:
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                raw = resp.read()
                if resp.status != 200:
                    raise RuntimeError(f"HTTP {resp.status}: {raw.decode('utf-8', 'replace')}")
                return json.loads(raw.decode("utf-8"))
        except urllib.error.HTTPError as exc:
            raw = exc.read()
            raise RuntimeError(f"HTTP {exc.code}: {raw.decode('utf-8', 'replace')}") from exc


@dataclass(frozen=True)
class OAuthStart:
    auth_url: str
    state: str
    code_verifier: str
    redirect_uri: str


def generate_oauth_url(
        *, redirect_uri: str = DEFAULT_REDIRECT_URI, scope: str = DEFAULT_SCOPE
) -> OAuthStart:
    state = _random_state()
    code_verifier = _pkce_verifier()
    code_challenge = _sha256_b64url_no_pad(code_verifier)

    params = {
        "client_id": CLIENT_ID,
        "response_type": "code",
        "redirect_uri": redirect_uri,
        "scope": scope,
        "state": state,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
        "prompt": "login",
        "id_token_add_organizations": "true",
        "codex_cli_simplified_flow": "true",
    }
    auth_url = f"{AUTH_URL}?{urllib.parse.urlencode(params)}"
    return OAuthStart(
        auth_url=auth_url,
        state=state,
        code_verifier=code_verifier,
        redirect_uri=redirect_uri,
    )


def submit_callback_url(
        *,
        callback_url: str,
        expected_state: str,
        code_verifier: str,
        redirect_uri: str = DEFAULT_REDIRECT_URI,
        session: requests.Session,  # 新增 session 参数
) -> str:
    cb = _parse_callback_url(callback_url)
    if cb["error"]:
        desc = cb["error_description"]
        raise RuntimeError(f"oauth error: {cb['error']}: {desc}".strip())

    if not cb["code"]:
        raise ValueError("callback url missing ?code=")
    if not cb["state"]:
        raise ValueError("callback url missing ?state=")
    if cb["state"] != expected_state:
        raise ValueError("state mismatch")

    # 使用 session 发送 POST 请求
    token_resp = session.post(
        TOKEN_URL,
        data={
            "grant_type": "authorization_code",
            "client_id": CLIENT_ID,
            "code": cb["code"],
            "redirect_uri": redirect_uri,
            "code_verifier": code_verifier,
        },
        headers={"Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json"},
        timeout=30,
    )

    if token_resp.status_code != 200:
        raise RuntimeError(f"token exchange failed: {token_resp.status_code}: {token_resp.text}")

    token_data = token_resp.json()
    access_token = (token_data.get("access_token") or "").strip()
    refresh_token = (token_data.get("refresh_token") or "").strip()
    id_token = (token_data.get("id_token") or "").strip()
    expires_in = _to_int(token_data.get("expires_in"))

    claims = _jwt_claims_no_verify(id_token)
    email = str(claims.get("email") or "").strip()
    auth_claims = claims.get("https://api.openai.com/auth") or {}
    account_id = str(auth_claims.get("chatgpt_account_id") or "").strip()

    now = int(time.time())
    expired_rfc3339 = time.strftime(
        "%Y-%m-%dT%H:%M:%SZ", time.gmtime(now + max(expires_in, 0))
    )
    now_rfc3339 = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(now))

    config = {
        "id_token": id_token,
        "access_token": access_token,
        "refresh_token": refresh_token,
        "account_id": account_id,
        "last_refresh": now_rfc3339,
        "email": email,
        "type": "codex",
        "expired": expired_rfc3339,
    }

    return json.dumps(config, ensure_ascii=False, separators=(",", ":"))


# ==========================================
# 核心注册逻辑
# ==========================================


def run(proxy: Optional[str], proxies: Optional[Dict[str, str]] = None) -> Optional[str]:
    if proxies is None and proxy:
        proxies = {"http": proxy, "https": proxy}

    s = requests.Session(proxies=proxies, impersonate="chrome")

    try:
        trace = s.get("https://cloudflare.com/cdn-cgi/trace", timeout=10)
        trace = trace.text
        loc_re = re.search(r"^loc=(.+)$", trace, re.MULTILINE)
        loc = loc_re.group(1) if loc_re else None
        print(f"[*] 当前 IP 所在地: {loc}")
        if loc == "CN" or loc == "HK":
            raise RuntimeError("检查代理哦w - 所在地不支持")
    except Exception as e:
        print(f"[Error] 网络连接检查失败: {e}")
        return None

    email, dev_token = get_email_and_token(proxies)
    if not email or not dev_token:
        return None
    print(f"[*] 成功获取 Tempmail.lol 邮箱与授权: {email}")

    oauth = generate_oauth_url()
    url = oauth.auth_url

    try:
        resp = s.get(url, timeout=15)
        did = s.cookies.get("oai-did")
        print(f"[*] Device ID: {did}")

        signup_body = f'{{"username":{{"value":"{email}","kind":"email"}},"screen_hint":"signup"}}'
        sen_req_body = f'{{"p":"","id":"{did}","flow":"authorize_continue"}}'

        sen_resp = requests.post(
            "https://sentinel.openai.com/backend-api/sentinel/req",
            headers={
                "origin": "https://sentinel.openai.com",
                "referer": "https://sentinel.openai.com/backend-api/sentinel/frame.html?sv=20260219f9f6",
                "content-type": "text/plain;charset=UTF-8",
            },
            data=sen_req_body,
            proxies=proxies,
            impersonate="chrome",
            timeout=15,
        )

        if sen_resp.status_code != 200:
            print(f"[Error] Sentinel 异常拦截，状态码: {sen_resp.status_code}")
            return None

        sen_token = sen_resp.json()["token"]
        sentinel = f'{{"p": "", "t": "", "c": "{sen_token}", "id": "{did}", "flow": "authorize_continue"}}'

        signup_resp = s.post(
            "https://auth.openai.com/api/accounts/authorize/continue",
            headers={
                "referer": "https://auth.openai.com/create-account",
                "accept": "application/json",
                "content-type": "application/json",
                "openai-sentinel-token": sentinel,
            },
            data=signup_body,
        )
        print(f"[*] 提交注册表单状态: {signup_resp.status_code}")

        # 生成密码
        password = _generate_password()
        print(f"[*] 生成密码: {password}")

        # 提交密码和邮箱
        register_body = json.dumps({
            "password": password,
            "username": email
        })

        pwd_resp = s.post(
            "https://auth.openai.com/api/accounts/user/register",
            headers={
                "referer": "https://auth.openai.com/create-account/password",
                "accept": "application/json",
                "content-type": "application/json",
            },
            data=register_body,
        )
        print(f"[*] 提交密码状态: {pwd_resp.status_code}")

        # 发送邮箱验证码
        otp_resp = s.get(
            "https://auth.openai.com/api/accounts/email-otp/send",
            headers={
                "referer": "https://auth.openai.com/create-account/password",
                "accept": "application/json",
            },
        )
        print(f"[*] 验证码发送状态: {otp_resp.status_code}")

        code = get_oai_code(dev_token, email, proxies)
        if not code:
            return None

        code_body = f'{{"code":"{code}"}}'
        code_resp = s.post(
            "https://auth.openai.com/api/accounts/email-otp/validate",
            headers={
                "referer": "https://auth.openai.com/email-verification",
                "accept": "application/json",
                "content-type": "application/json",
            },
            data=code_body,
        )
        print(f"[*] 验证码校验状态: {code_resp.status_code}")

        # 随机生成姓名和生日
        _first_names = [
            'Chen', 'Lin', 'Huang', 'Zhou', 'Wu', 'Zheng', 'Xie', 'Tang', 'Su', 'Jiang', 'Cassius', 'Elowen',
            'Finnegan', 'Lyra', 'Orion', 'Thalia', 'Caspian', 'Seraphina', 'Lysander', 'Indigo', 'Zephyr', 'Briar',
            'Calliope', 'Soren'
        ]

        # 中文名（双字名，取有诗意但不太泛滥的字）
        _last_names = [
            'Yichen', 'Zihan', 'Yuxuan', 'Muyang', 'Jingyi', 'Shuyan', 'Haoran', 'Zixuan', 'Yunxi', 'Mingzhe',
            'Wanning', 'Zhiyuan', 'Ruxuan', 'Yitong', 'Holloway', 'Sterling', 'Ravenwood', 'Ashford', 'Whitmore',
            'Blackthorn', 'Pendragon', 'Silverwood', 'Storm', 'Wilde', 'Frost', 'Everhart', 'Hawthorne'
        ]
        _name = f"{random.choice(_first_names)} {random.choice(_last_names)}"
        _birth_year = random.randint(1985, 2000)
        _birth_month = random.randint(1, 12)
        _birth_day = random.randint(1, 28)
        _birthdate = f"{_birth_year}-{_birth_month:02d}-{_birth_day:02d}"
        create_account_body = json.dumps({'name': _name, 'birthdate': _birthdate})

        create_account_resp = s.post(
            "https://auth.openai.com/api/accounts/create_account",
            headers={
                "referer": "https://auth.openai.com/about-you",
                "accept": "application/json",
                "content-type": "application/json",
            },
            data=create_account_body,
        )
        create_account_status = create_account_resp.status_code
        print(f"[*] 账户创建状态: {create_account_status}")

        if create_account_status != 200:
            print(create_account_resp.text)
            return None

        # 处理重定向链，找到回调 URL
        current_url = url
        for _ in range(6):
            final_resp = s.get(current_url, allow_redirects=False, timeout=15)
            location = final_resp.headers.get('Location', '')
            if final_resp.status_code == 200:
                break
            if not location:
                break
            next_url = urllib_parse.urljoin(current_url, location)
            if 'code=' in next_url and 'state=' in next_url:
                print(f"找到回调 URL: {next_url[:100]}...")
            current_url = next_url
        else:
            print("[Error] 未能在重定向链中捕获最终 Callback URL")
            return None

        login_body = f'{{"username":{{"value":"{email}","kind":"email"}}}}'
        headers = {
            'referer': 'https://auth.openai.com/log-in',
            'accept': 'application/json',
            'content-type': 'application/json'
        }
        if sen_token:
            sentinel = f'{{"p": "", "t": "", "c": "{sen_token}", "id": "{did}", "flow": "authorize_continue"}}'
            headers['openai-sentinel-token'] = sentinel
        response = s.post(
            'https://auth.openai.com/api/accounts/authorize/continue',
            headers=headers,
            data=login_body
        )
        print(f'[*] 提交登录表单状态: {response.status_code}')
        if response.status_code != 200:
            return None

        # 再次发送 OTP 并验证（免密登录流程）
        otp_resp = s.post(
            'https://auth.openai.com/api/accounts/passwordless/send-otp',
            headers={
                'referer': 'https://auth.openai.com/log-in/password',
                'accept': 'application/json'
            }
        )
        print(f'[*] 验证码发送状态: {otp_resp.status_code}')
        # 创建新的 seen_ids 集合，用于第二次获取验证码
        otp_seen_ids = set()
        code = get_oai_code(dev_token, email, proxies, otp_seen_ids)
        if not code:
            return None
        code_body = f'{{"code":"{code}"}}'
        code_resp = s.post(
            'https://auth.openai.com/api/accounts/email-otp/validate',
            headers={
                'referer': 'https://auth.openai.com/email-verification',
                'accept': 'application/json',
                'content-type': 'application/json'
            },
            data=code_body
        )
        print(f'[*] 验证码校验状态: {code_resp.status_code}')

        # 获取 auth cookie
        auth_cookie = s.cookies.get('oai-client-auth-session')
        if not auth_cookie:
            print('[Error] 未能获取到授权 Cookie')
            return None
        auth_json = _decode_jwt_segment(auth_cookie.split('.')[0])
        workspaces = auth_json.get('workspaces', [])
        if not workspaces:
            print('[Error] 授权 Cookie 里没有 workspace 信息')
            return None
        workspace_id = str(workspaces[0].get('id', '')).strip()
        if not workspace_id:
            print('[Error] 无法解析 workspace_id')
            return None
        select_body = f'{{"workspace_id":"{workspace_id}"}}'
        select_resp = s.post(
            'https://auth.openai.com/api/accounts/workspace/select',
            headers={
                'referer': 'https://auth.openai.com/sign-in-with-chatgpt/codex/consent',
                'content-type': 'application/json'
            },
            data=select_body
        )
        if select_resp.status_code != 200:
            print(f'[Error] 选择 workspace 失败，状态码: {select_resp.status_code}')
            return None
        continue_url = str(select_resp.json().get('continue_url', '')).strip()
        if not continue_url:
            print('[Error] workspace/select 响应里缺少 continue_url')
            return None

        # 最终重定向获取最终 callback URL
        current_url = continue_url
        for _ in range(6):
            final_resp = s.get(current_url, allow_redirects=False, timeout=15)
            location = final_resp.headers.get('Location', '')
            if final_resp.status_code not in (301, 302, 303, 307, 308):
                break
            if not location:
                break
            next_url = urllib_parse.urljoin(current_url, location)
            if 'code=' in next_url and 'state=' in next_url:
                return submit_callback_url(
                    callback_url=next_url,
                    code_verifier=oauth.code_verifier,
                    redirect_uri=oauth.redirect_uri,
                    expected_state=oauth.state,
                    session=s  # 传入当前 session
                )
            current_url = next_url

        print('[Error] 未能在重定向链中捕获最终 Callback URL')
        return None

    except Exception as e:
        print(f"[Error] 运行时发生错误: {e}")
        return None


def load_upload_config(config_path: str) -> Dict[str, Any]:
    config = dict(DEFAULT_UPLOAD_CONFIG)
    config["headers"] = dict(DEFAULT_UPLOAD_CONFIG.get("headers", {}))

    cfg_dir = os.path.dirname(os.path.abspath(config_path))
    if cfg_dir:
        os.makedirs(cfg_dir, exist_ok=True)

    if not os.path.exists(config_path):
        try:
            with open(config_path, "w", encoding="utf-8") as f:
                json.dump(config, f, ensure_ascii=False, indent=2)
            print(f"[*] 已创建上传配置文件: {config_path}")
        except Exception as e:
            print(f"[Warn] 创建上传配置文件失败: {e}")
    else:
        try:
            with open(config_path, "r", encoding="utf-8") as f:
                user_cfg = json.load(f)

            if isinstance(user_cfg, dict):
                for key in (
                    "enabled",
                    "url",
                    "authorization",
                    "auth_type",
                    "username",
                    "password",
                    "timeout",
                ):
                    if key in user_cfg:
                        config[key] = user_cfg[key]

                user_headers = user_cfg.get("headers")
                if isinstance(user_headers, dict):
                    for k, v in user_headers.items():
                        if v is not None:
                            config["headers"][str(k)] = str(v)
        except Exception as e:
            print(f"[Warn] 读取上传配置失败，使用默认配置: {e}")

    # 环境变量覆盖（Docker 场景优先）
    env_map = {
        "enabled": os.getenv("UPLOAD_ENABLED"),
        "url": os.getenv("UPLOAD_URL"),
        "authorization": os.getenv("UPLOAD_AUTHORIZATION"),
        "auth_type": os.getenv("UPLOAD_AUTH_TYPE"),
        "username": os.getenv("UPLOAD_USERNAME"),
        "password": os.getenv("UPLOAD_PASSWORD"),
        "timeout": os.getenv("UPLOAD_TIMEOUT"),
    }
    for key, value in env_map.items():
        if value is not None and str(value).strip() != "":
            config[key] = value

    env_headers = _load_headers_from_env()
    if env_headers:
        config["headers"].update(env_headers)

    return _normalize_upload_config(config)


def ensure_result_dirs(base_dir: str) -> Tuple[str, str]:
    success_dir = os.path.join(base_dir, "success")
    fail_dir = os.path.join(base_dir, "fail")
    os.makedirs(success_dir, exist_ok=True)
    os.makedirs(fail_dir, exist_ok=True)
    return success_dir, fail_dir


def move_file_to_dir(src_path: str, dst_dir: str) -> str:
    os.makedirs(dst_dir, exist_ok=True)
    base_name = os.path.basename(src_path)
    dst_path = os.path.join(dst_dir, base_name)

    if os.path.exists(dst_path):
        stem, ext = os.path.splitext(base_name)
        dst_path = os.path.join(dst_dir, f"{stem}_{int(time.time())}{ext}")

    os.replace(src_path, dst_path)
    return dst_path


def upload_auth_file(file_path: str, upload_cfg: Dict[str, Any], proxy: Optional[str] = None) -> Tuple[bool, str]:
    if not upload_cfg.get("enabled", True):
        return False, "上传功能未启用(enabled=false)"

    upload_url = str(upload_cfg.get("url", "")).strip()
    if not upload_url:
        return False, "上传地址为空(url)"

    headers = dict(upload_cfg.get("headers") or {})
    authorization = _build_authorization(upload_cfg)
    if authorization:
        headers["Authorization"] = authorization

    proxies: Any = None
    if proxy:
        proxies = {"http": proxy, "https": proxy}

    multipart = CurlMime()
    multipart.addpart(
        name="file",
        filename=os.path.basename(file_path),
        local_path=file_path,
        content_type="application/json",
    )

    try:
        resp = requests.post(
            upload_url,
            headers=headers,
            multipart=multipart,
            proxies=proxies,
            impersonate="chrome",
            timeout=int(upload_cfg.get("timeout", 30)),
        )
    except Exception as e:
        return False, f"请求异常: {e}"
    finally:
        try:
            multipart.close()
        except Exception:
            pass

    resp_text = (resp.text or "").strip()
    if resp.status_code != 200:
        return False, f"HTTP {resp.status_code}: {resp_text[:200]}"

    try:
        payload = resp.json()
    except Exception:
        payload = {}

    if isinstance(payload, dict) and str(payload.get("status", "")).lower() == "ok":
        return True, resp_text

    if '"status":"ok"' in resp_text.replace(" ", ""):
        return True, resp_text

    return False, f"返回非成功结果: {resp_text[:200]}"


def main() -> None:
    parser = argparse.ArgumentParser(description="OpenAI 自动注册脚本 (Tempmail.lol 版本)")
    parser.add_argument(
        "--proxy",
        default=os.getenv("PROXY", None),
        help="代理地址，如 http://127.0.0.1:7890 (也可用环境变量 PROXY)",
    )
    parser.add_argument(
        "--proxy-config",
        default=os.getenv("PROXY_CONFIG", ""),
        help="代理池配置文件路径(默认尝试脚本目录下 proxy_pool.json)",
    )
    parser.add_argument(
        "--proxy-strategy",
        default=os.getenv("PROXY_STRATEGY", "random"),
        choices=["random", "first"],
        help="代理池选择策略: random|first",
    )
    parser.add_argument(
        "--kookeey-proxy",
        default=os.getenv("KOOKEEY_PROXY", ""),
        help="Kookeey 完整代理串，支持 http://user:pass@host:port 或 host:port:user:pass",
    )
    parser.add_argument(
        "--kookeey-conn",
        default=os.getenv("KOOKEEY_CONN", ""),
        help="Kookeey 连接信息，格式 host:port:username:password",
    )
    parser.add_argument(
        "--kookeey-scheme",
        default=os.getenv("KOOKEEY_SCHEME", "http"),
        choices=["http", "https"],
        help="Kookeey 代理协议(当前推荐 http)",
    )
    parser.add_argument(
        "--kookeey-pick-url",
        default=os.getenv("KOOKEEY_PICK_URL", ""),
        help="Kookeey API 提取链接；配置后每轮开始前自动提取一条代理",
    )
    parser.add_argument(
        "--kookeey-pick-timeout",
        type=int,
        default=_to_int(os.getenv("KOOKEEY_PICK_TIMEOUT", "15")) or 15,
        help="Kookeey API 提取超时时间(秒)",
    )
    parser.add_argument(
        "--kookeey-host",
        default=os.getenv("KOOKEEY_HOST", ""),
        help="Kookeey 网关节点，如 gate-hk.kookeey.info",
    )
    parser.add_argument(
        "--kookeey-port",
        type=int,
        default=_to_int(os.getenv("KOOKEEY_PORT", "0")),
        help="Kookeey 端口，如 1000",
    )
    parser.add_argument(
        "--kookeey-line-username",
        default=os.getenv("KOOKEEY_LINE_USERNAME", ""),
        help="Kookeey 线路连接用户名（已生成好的完整用户名）",
    )
    parser.add_argument(
        "--kookeey-line-password",
        default=os.getenv("KOOKEEY_LINE_PASSWORD", ""),
        help="Kookeey 线路连接密码（已生成好的完整密码）",
    )
    parser.add_argument(
        "--kookeey-user-id",
        default=os.getenv("KOOKEEY_USER_ID", ""),
        help="Kookeey 用户ID，例如 6977725",
    )
    parser.add_argument(
        "--kookeey-account",
        default=os.getenv("KOOKEEY_ACCOUNT", ""),
        help="Kookeey 安全策略用户名，例如 1ada04e0",
    )
    parser.add_argument(
        "--kookeey-password",
        default=os.getenv("KOOKEEY_PASSWORD", ""),
        help="Kookeey 安全策略密码，例如 0752dbfe",
    )
    parser.add_argument(
        "--kookeey-country",
        default=os.getenv("KOOKEEY_COUNTRY", ""),
        help="Kookeey 国家 ISO 码，例如 US",
    )
    parser.add_argument(
        "--kookeey-session",
        default=os.getenv("KOOKEEY_SESSION", ""),
        help="Kookeey 固定 session；为空则每轮自动随机生成",
    )
    parser.add_argument(
        "--kookeey-session-len",
        type=int,
        default=_to_int(os.getenv("KOOKEEY_SESSION_LEN", "8")) or 8,
        help="未指定 --kookeey-session 时，随机 session 长度",
    )
    parser.add_argument(
        "--kookeey-rotate",
        default=os.getenv("KOOKEEY_ROTATE", "1m"),
        help="Kookeey IP 轮转标识，例如 1m",
    )
    parser.add_argument("--once", action="store_true", help="只运行一次")
    parser.add_argument("--sleep-min", type=int, default=5, help="循环模式最短等待秒数")
    parser.add_argument(
        "--sleep-max", type=int, default=30, help="循环模式最长等待秒数"
    )
    parser.add_argument(
        "--work-dir",
        default=os.getenv("WORK_DIR", ""),
        help="工作目录(存放 token/success/fail/upload_config.json；默认脚本目录)",
    )
    parser.add_argument(
        "--upload-config",
        default=None,
        help="上传配置文件路径(默认: 工作目录/upload_config.json)",
    )
    args = parser.parse_args()

    if not args.once and _parse_bool(os.getenv("RUN_ONCE"), False):
        args.once = True

    sleep_min = max(1, args.sleep_min)
    sleep_max = max(sleep_min, args.sleep_max)

    script_dir = os.path.dirname(os.path.abspath(__file__))
    work_dir = (args.work_dir or "").strip() or script_dir
    os.makedirs(work_dir, exist_ok=True)

    # 默认不走代理：只有显式传 --proxy / Kookeey / --proxy-config（或对应环境变量）才启用代理
    proxy_config_path = (args.proxy_config or "").strip()
    if proxy_config_path and not os.path.isabs(proxy_config_path):
        proxy_config_path = os.path.abspath(os.path.join(script_dir, proxy_config_path))

    kookeey_cfg = {
        "proxy_url": args.kookeey_proxy,
        "conn": args.kookeey_conn,
        "scheme": args.kookeey_scheme,
        "pick_url": args.kookeey_pick_url,
        "pick_timeout": args.kookeey_pick_timeout,
        "host": args.kookeey_host,
        "port": args.kookeey_port,
        "line_username": args.kookeey_line_username,
        "line_password": args.kookeey_line_password,
        "user_id": args.kookeey_user_id,
        "account": args.kookeey_account,
        "password": args.kookeey_password,
        "country": args.kookeey_country,
        "session": args.kookeey_session,
        "rotate": args.kookeey_rotate,
        "session_len": args.kookeey_session_len,
    }
    has_kookeey = any(str(v or "").strip() for v in [
        args.kookeey_proxy,
        args.kookeey_conn,
        args.kookeey_pick_url,
        args.kookeey_host,
        args.kookeey_line_username,
        args.kookeey_user_id,
    ])

    upload_config_path = args.upload_config or os.path.join(work_dir, "upload_config.json")
    upload_cfg = load_upload_config(upload_config_path)
    success_dir, fail_dir = ensure_result_dirs(work_dir)

    count = 0
    print("[Info] OpenAI Auto-Registrar changed by b.encenc.com (Tempmail.lol Edition)")
    print(f"[Info] 工作目录: {work_dir}")
    print(f"[Info] 上传配置: {upload_config_path}")
    if args.proxy:
        print("[Info] 代理模式: 手动代理(--proxy)")
    elif has_kookeey:
        print("[Info] 代理模式: Kookeey")
        if args.kookeey_host:
            print(f"[Info] Kookeey 节点: {args.kookeey_host}:{args.kookeey_port}")
        if args.kookeey_country:
            print(f"[Info] Kookeey 国家: {str(args.kookeey_country).upper()}")
    elif proxy_config_path:
        print(f"[Info] 代理模式: 代理池({args.proxy_strategy})")
        print(f"[Info] 代理池配置: {proxy_config_path}")
    else:
        print("[Info] 代理模式: 关闭(默认直连)")

    while True:
        count += 1
        print(
            f"\n[{datetime.now().strftime('%H:%M:%S')}] >>> 开始第 {count} 次注册流程 <<<"
        )

        try:
            selected_proxy, selected_proxies, proxy_desc = resolve_proxy_settings(
                args.proxy,
                proxy_config_path,
                args.proxy_strategy,
                kookeey_cfg if has_kookeey else None,
            )
            if proxy_desc:
                print(f"[*] 本轮代理: {proxy_desc}")
            else:
                print("[*] 本轮直连(未启用代理)")

            token_json = run(selected_proxy, selected_proxies)

            if token_json:
                try:
                    t_data = json.loads(token_json)
                    fname_email = t_data.get("email", "unknown").replace("@", "_")
                except Exception:
                    fname_email = "unknown"

                file_name = f"token_{fname_email}_{int(time.time())}.json"
                file_path = os.path.join(work_dir, file_name)

                with open(file_path, "w", encoding="utf-8") as f:
                    f.write(token_json)

                print(f"[*] 成功! Token 已保存至: {file_path}")

                upload_ok, upload_msg = upload_auth_file(file_path, upload_cfg, selected_proxy)
                print(f"[*] 上传结果: {'成功' if upload_ok else '失败'} | {upload_msg}")

                target_dir = success_dir if upload_ok else fail_dir
                final_path = move_file_to_dir(file_path, target_dir)
                print(f"[*] 文件已归档至: {final_path}")
            else:
                print("[-] 本次注册失败。")

        except Exception as e:
            print(f"[Error] 发生未捕获异常: {e}")

        if args.once:
            break

        wait_time = random.randint(sleep_min, sleep_max)
        print(f"[*] 休息 {wait_time} 秒...")
        time.sleep(wait_time)


if __name__ == "__main__":
    main()