#!/usr/bin/env python3
import json
import os
import re
import secrets
import subprocess
import threading
import time
from datetime import datetime, timezone
from email import policy
from email.parser import BytesParser
from html import unescape
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

try:
    import docker
except Exception:  # pragma: no cover - optional dependency installed at runtime
    docker = None

EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$")
ROOT_DOMAIN_RE = re.compile(r"^(?:[a-z0-9](?:[a-z0-9\-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$")
TAG_RE = re.compile(r"<[^>]+>")
SPACE_RE = re.compile(r"\s+")
DOMAIN_REGISTRY_VERSION = 1


def get_env(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


HOST = get_env("MAIL_BRIDGE_HOST", "127.0.0.1")
PORT = int(get_env("MAIL_BRIDGE_PORT", "18762") or "18762")
APP_ROOT = Path(get_env("MAIL_BRIDGE_APP_ROOT", "/opt/opentrashmail"))
DATA_ROOT = Path(get_env("MAIL_BRIDGE_DATA_ROOT", str(APP_ROOT / "data")))
ENV_PATH = Path(get_env("MAIL_BRIDGE_ENV_PATH", str(APP_ROOT / ".env")))
CONFIG_INI_PATH = Path(get_env("MAIL_BRIDGE_CONFIG_INI_PATH", str(APP_ROOT / "config.ini")))
DOMAIN_REGISTRY_PATH = Path(
    get_env("MAIL_BRIDGE_DOMAIN_REGISTRY_PATH", str(DATA_ROOT / ".mail-bridge-domain-registry.json"))
)
AUTH_TOKEN = get_env("MAIL_BRIDGE_TOKEN")
DEFAULT_PUBLIC_BASE = get_env("MAIL_BRIDGE_PUBLIC_BASE", "http://localhost:18762")
TARGET_CONTAINER = get_env("MAIL_BRIDGE_TARGET_CONTAINER", "opentrashmail")


def to_iso_utc_from_millis(millis: int) -> str:
    return datetime.fromtimestamp(millis / 1000, tz=timezone.utc).isoformat().replace("+00:00", "Z")


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def strip_html(value: str) -> str:
    text = TAG_RE.sub(" ", value or "")
    text = unescape(text)
    return SPACE_RE.sub(" ", text).strip()


def parse_raw_headers(raw_content: str) -> dict[str, Any]:
    if not raw_content:
        return {}
    try:
        message = BytesParser(policy=policy.default).parsebytes(raw_content.encode("utf-8", errors="replace"))
    except Exception:
        return {}

    text_parts: list[str] = []
    html_parts: list[str] = []

    if message.is_multipart():
        for part in message.walk():
            content_type = part.get_content_type()
            disposition = (part.get("Content-Disposition") or "").lower()
            if "attachment" in disposition:
                continue
            try:
                content = part.get_content()
            except Exception:
                continue
            if not isinstance(content, str):
                continue
            if content_type == "text/plain":
                text_parts.append(content)
            elif content_type == "text/html":
                html_parts.append(content)
    else:
        try:
            content = message.get_content()
        except Exception:
            content = ""
        if isinstance(content, str):
            if message.get_content_type() == "text/html":
                html_parts.append(content)
            else:
                text_parts.append(content)

    return {
        "subject": str(message.get("Subject") or "").strip(),
        "from": str(message.get("From") or "").strip(),
        "text": "\n".join(part.strip() for part in text_parts if part.strip()),
        "html": "\n".join(part.strip() for part in html_parts if part.strip()),
    }


def safe_mailbox_dir(address: str) -> Path | None:
    normalized = (address or "").strip().lower()
    if not EMAIL_RE.match(normalized):
        return None
    return DATA_ROOT / normalized


def choose_latest_message_path(mailbox_dir: Path) -> Path | None:
    latest_path: Path | None = None
    latest_rank: tuple[int, float] | None = None

    for path in mailbox_dir.glob("*.json"):
        stem = path.stem
        try:
            rank = (int(stem), path.stat().st_mtime)
        except ValueError:
            rank = (0, path.stat().st_mtime)
        if latest_rank is None or rank > latest_rank:
            latest_rank = rank
            latest_path = path
    return latest_path


def build_intro(subject: str, text: str, html: str) -> str:
    for candidate in (text, strip_html(html), subject):
        candidate = SPACE_RE.sub(" ", candidate or "").strip()
        if candidate:
            return candidate[:240]
    return ""


def normalize_mail_record(address: str, message_path: Path, payload: dict[str, Any]) -> dict[str, Any]:
    parsed = payload.get("parsed") if isinstance(payload.get("parsed"), dict) else {}
    raw_info = parse_raw_headers(str(payload.get("raw") or ""))

    subject = str(parsed.get("subject") or raw_info.get("subject") or "").strip()
    html = str(parsed.get("htmlbody") or raw_info.get("html") or "").strip()
    text = str(parsed.get("body") or raw_info.get("text") or "").strip()
    sender = str(parsed.get("from") or payload.get("from") or raw_info.get("from") or "").strip()
    recipients = payload.get("rcpts") if isinstance(payload.get("rcpts"), list) else [address]

    try:
        received_at = to_iso_utc_from_millis(int(message_path.stem))
    except ValueError:
        received_at = datetime.fromtimestamp(message_path.stat().st_mtime, tz=timezone.utc).isoformat().replace("+00:00", "Z")

    return {
        "id": message_path.stem,
        "subject": subject,
        "text": text,
        "body": text,
        "html": html,
        "intro": build_intro(subject, text, html),
        "from": {"address": sender} if sender else None,
        "to": [{"address": str(item).strip()} for item in recipients if str(item).strip()],
        "received_at": received_at,
        "source": "opentrashmail-file-cache",
    }


def load_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    try:
        for raw_line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip()
    except FileNotFoundError:
        return {}
    return values


def normalize_root_domain(value: Any) -> str:
    text = str(value or "").strip().lower()
    while text.startswith("*."):
        text = text[2:]
    return text.lstrip("@.").rstrip(".")


def is_valid_root_domain(value: str) -> bool:
    return bool(ROOT_DOMAIN_RE.match(normalize_root_domain(value)))


def slugify_domain(value: str) -> str:
    slug = normalize_root_domain(value).replace(".", "_").replace("-", "_")
    slug = re.sub(r"[^a-z0-9_]", "", slug)
    return slug or f"domain_{secrets.token_hex(4)}"


def parse_bool(value: Any, fallback: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    text = str(value or "").strip().lower()
    if text in {"1", "true", "yes", "on"}:
        return True
    if text in {"0", "false", "no", "off"}:
        return False
    return fallback


def coerce_weight(value: Any, fallback: int = 100) -> int:
    try:
        number = int(value)
    except Exception:
        number = fallback
    return max(1, min(10000, number))


def load_runtime_settings() -> dict[str, str]:
    env_values = load_env_file(ENV_PATH)
    auth_token = env_values.get("MAIL_BRIDGE_TOKEN", "").strip() or AUTH_TOKEN
    admin_password = env_values.get("ADMIN_PASSWORD") or env_values.get("PASSWORD", "")
    public_base = env_values.get("MAIL_BRIDGE_PUBLIC_BASE", "").strip() or DEFAULT_PUBLIC_BASE
    return {
        "auth_token": auth_token,
        "admin_password": admin_password,
        "public_base": public_base,
    }


def parse_domains_env(value: str) -> tuple[list[str], set[str]]:
    roots: list[str] = []
    wildcard_roots: set[str] = set()
    for raw_item in str(value or "").split(","):
        item = raw_item.strip()
        if not item:
            continue
        normalized = normalize_root_domain(item)
        if not normalized:
            continue
        if item.startswith("*."):
            wildcard_roots.add(normalized)
        if normalized not in roots:
            roots.append(normalized)
    return roots, wildcard_roots


def bootstrap_registry_from_env() -> dict[str, Any]:
    env_values = load_env_file(ENV_PATH)
    roots, wildcard_roots = parse_domains_env(env_values.get("DOMAINS", ""))
    domains = []
    default_domain = roots[0] if roots else ""
    for root in roots:
        domains.append(
            {
                "id": slugify_domain(root),
                "root_domain": root,
                "enabled": True,
                "is_default": root == default_domain,
                "wildcard_enabled": root in wildcard_roots,
                "allow_random_assignment": True,
                "allow_manual_selection": True,
                "weight": 100,
                "note": "",
            }
        )
    return {
        "version": DOMAIN_REGISTRY_VERSION,
        "updated_at": utc_now_iso(),
        "domains": domains,
    }


def normalize_registry_entry(raw: Any, index: int = 0) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None
    root_domain = normalize_root_domain(raw.get("root_domain") or raw.get("domain"))
    if not is_valid_root_domain(root_domain):
        return None
    return {
        "id": str(raw.get("id") or slugify_domain(root_domain)).strip() or slugify_domain(root_domain),
        "root_domain": root_domain,
        "enabled": parse_bool(raw.get("enabled"), True),
        "is_default": parse_bool(raw.get("is_default"), index == 0),
        "wildcard_enabled": parse_bool(raw.get("wildcard_enabled"), True),
        "allow_random_assignment": parse_bool(raw.get("allow_random_assignment"), True),
        "allow_manual_selection": parse_bool(raw.get("allow_manual_selection"), True),
        "weight": coerce_weight(raw.get("weight"), 100),
        "note": str(raw.get("note") or "").strip(),
    }


def normalize_registry_payload(payload: dict[str, Any] | None) -> dict[str, Any]:
    source = payload if isinstance(payload, dict) else {}
    raw_entries = source.get("domains") if isinstance(source.get("domains"), list) else []
    normalized_entries: list[dict[str, Any]] = []
    seen_roots: set[str] = set()

    for index, raw_entry in enumerate(raw_entries):
        entry = normalize_registry_entry(raw_entry, index=index)
        if not entry:
            continue
        if entry["root_domain"] in seen_roots:
            continue
        seen_roots.add(entry["root_domain"])
        normalized_entries.append(entry)

    if not normalized_entries:
        bootstrap = bootstrap_registry_from_env()
        normalized_entries = bootstrap["domains"]

    default_candidates = [item for item in normalized_entries if item["is_default"] and item["enabled"]]
    default_root = default_candidates[0]["root_domain"] if default_candidates else ""
    if not default_root:
        for item in normalized_entries:
            if item["enabled"]:
                default_root = item["root_domain"]
                break
        if not default_root:
            default_root = normalized_entries[0]["root_domain"]

    for item in normalized_entries:
        item["is_default"] = item["root_domain"] == default_root

    return {
        "version": DOMAIN_REGISTRY_VERSION,
        "updated_at": utc_now_iso(),
        "domains": normalized_entries,
    }


def load_domain_registry() -> dict[str, Any]:
    try:
        payload = json.loads(DOMAIN_REGISTRY_PATH.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return normalize_registry_payload(bootstrap_registry_from_env())
    except Exception:
        return normalize_registry_payload(bootstrap_registry_from_env())
    return normalize_registry_payload(payload)


def save_domain_registry(registry: dict[str, Any]) -> None:
    DOMAIN_REGISTRY_PATH.parent.mkdir(parents=True, exist_ok=True)
    temp_path = DOMAIN_REGISTRY_PATH.with_suffix(".tmp")
    temp_path.write_text(json.dumps(registry, ensure_ascii=False, indent=2), encoding="utf-8")
    temp_path.replace(DOMAIN_REGISTRY_PATH)


def compose_domains_env(entries: list[dict[str, Any]]) -> list[str]:
    tokens: list[str] = []
    for entry in entries:
        if not entry.get("enabled"):
            continue
        root = normalize_root_domain(entry.get("root_domain"))
        if not root:
            continue
        if root not in tokens:
            tokens.append(root)
        if entry.get("wildcard_enabled"):
            wildcard = f"*.{root}"
            if wildcard not in tokens:
                tokens.append(wildcard)
    return tokens


def upsert_env_value(lines: list[str], key: str, value: str) -> list[str]:
    rendered = f"{key}={value}"
    updated = False
    result: list[str] = []
    prefix = f"{key}="
    for line in lines:
        if line.startswith(prefix):
            if not updated:
                result.append(rendered)
                updated = True
            continue
        result.append(line)
    if not updated:
        result.append(rendered)
    return result


def update_env_file(domains_value: str | None = None, persisted_token: str | None = None, public_base: str | None = None) -> None:
    lines = []
    if ENV_PATH.exists():
        lines = ENV_PATH.read_text(encoding="utf-8", errors="ignore").splitlines()
    if domains_value is not None:
        lines = upsert_env_value(lines, "DOMAINS", domains_value)
    if persisted_token is not None and persisted_token != "":
        lines = upsert_env_value(lines, "MAIL_BRIDGE_TOKEN", persisted_token)
    if public_base is not None and public_base != "":
        lines = upsert_env_value(lines, "MAIL_BRIDGE_PUBLIC_BASE", public_base)
    ENV_PATH.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def write_opentrashmail_config_ini(domains_value: str | None = None) -> None:
    env_values = load_env_file(ENV_PATH)
    effective_domains = domains_value if domains_value is not None else env_values.get("DOMAINS", "example.com,*.example.com")
    content = "\n".join(
        [
            "[GENERAL]",
            f"DOMAINS={effective_domains}",
            f"URL={env_values.get('URL', 'http://localhost:8080')}",
            f"PASSWORD={env_values.get('PASSWORD', '')}",
            f"ALLOWED_IPS={env_values.get('ALLOWED_IPS', '')}",
            "",
            "[MAILSERVER]",
            f"MAILPORT={env_values.get('MAILPORT', '25')}",
            f"DISCARD_UNKNOWN={env_values.get('DISCARD_UNKNOWN', 'true')}",
            f"ATTACHMENTS_MAX_SIZE={env_values.get('ATTACHMENTS_MAX_SIZE', '0')}",
            f"MAILPORT_TLS={env_values.get('MAILPORT_TLS', '0')}",
            f"TLS_CERTIFICATE={env_values.get('TLS_CERTIFICATE', '')}",
            f"TLS_PRIVATE_KEY={env_values.get('TLS_PRIVATE_KEY', '0')}",
            "",
            "[DATETIME]",
            f"DATEFORMAT={env_values.get('DATEFORMAT', 'YYYY-MM-DD HH:mm:ss')}",
            "",
            "[CLEANUP]",
            f"DELETE_OLDER_THAN_DAYS={env_values.get('DELETE_OLDER_THAN_DAYS', '7')}",
            "",
            "[WEBHOOK]",
            f"WEBHOOK_URL={env_values.get('WEBHOOK_URL', '')}",
            "",
            "[ADMIN]",
            f"ADMIN_ENABLED={env_values.get('ADMIN_ENABLED', 'true')}",
            f"ADMIN_PASSWORD={env_values.get('ADMIN_PASSWORD', env_values.get('PASSWORD', ''))}",
            f"SHOW_ACCOUNT_LIST={env_values.get('SHOW_ACCOUNT_LIST', 'true')}",
            f"ADMIN={env_values.get('ADMIN', '')}",
            f"SHOW_LOGS={env_values.get('SHOW_LOGS', 'false')}",
            "",
        ]
    )
    CONFIG_INI_PATH.write_text(content, encoding="utf-8")


def build_registry_summary(registry: dict[str, Any]) -> dict[str, Any]:
    domains = registry.get("domains") if isinstance(registry.get("domains"), list) else []
    enabled = [item for item in domains if item.get("enabled")]
    selectable = [item for item in enabled if item.get("allow_manual_selection")]
    random_assignable = [item for item in enabled if item.get("allow_random_assignment")]
    default_domain = next((item["root_domain"] for item in enabled if item.get("is_default")), "")
    composed_domains = compose_domains_env(domains)
    return {
        "enabled_root_count": len(enabled),
        "manual_selectable_count": len(selectable),
        "random_assignable_count": len(random_assignable),
        "default_domain": default_domain,
        "composed_domains": composed_domains,
        "registry_path": str(DOMAIN_REGISTRY_PATH),
        "env_path": str(ENV_PATH),
    }


def build_mail_bridge_settings_payload() -> dict[str, Any]:
    settings = load_runtime_settings()
    return {
        "ok": True,
        "api_base": settings["public_base"],
        "auth_token": settings["auth_token"],
        "admin_password_bound": bool(settings["auth_token"]) and settings["auth_token"] == settings["admin_password"],
        "message": "当前 Mail Bridge 配置已加载。",
    }


def restart_opentrashmail() -> dict[str, Any]:
    if docker is not None:
        try:
            client = docker.from_env()
            container = client.containers.get(TARGET_CONTAINER)
            container.restart(timeout=30)
            return {
                "ok": True,
                "returncode": 0,
                "stdout": f"restarted container {TARGET_CONTAINER}",
                "stderr": "",
            }
        except Exception as exc:
            return {
                "ok": False,
                "returncode": 1,
                "stdout": "",
                "stderr": f"docker sdk restart failed: {exc}",
            }

    result = subprocess.run(
        ["docker", "restart", TARGET_CONTAINER],
        capture_output=True,
        text=True,
        timeout=180,
        check=False,
    )
    return {
        "ok": result.returncode == 0,
        "returncode": result.returncode,
        "stdout": result.stdout[-4000:],
        "stderr": result.stderr[-4000:],
    }


def restart_opentrashmail_async(delay_seconds: float = 0.8) -> None:
    def _worker() -> None:
        if delay_seconds > 0:
            time.sleep(delay_seconds)
        result = restart_opentrashmail()
        status = "ok" if result["ok"] else "failed"
        print(
            f"[mail-bridge] async restart {status} returncode={result['returncode']}"
            f" stdout={result['stdout']!r} stderr={result['stderr']!r}",
            flush=True,
        )

    threading.Thread(target=_worker, daemon=True).start()


def apply_registry(registry: dict[str, Any], *, defer_restart: bool = False) -> dict[str, Any]:
    settings = load_runtime_settings()
    persisted_token = settings["auth_token"] or settings["admin_password"] or secrets.token_urlsafe(24)
    composed_domains = compose_domains_env(registry["domains"])
    save_domain_registry(registry)
    update_env_file(",".join(composed_domains), persisted_token)
    write_opentrashmail_config_ini(",".join(composed_domains))

    if defer_restart:
        restart_opentrashmail_async()
        restart_result = {
            "ok": True,
            "scheduled": True,
            "returncode": 0,
            "stdout": "",
            "stderr": "",
        }
    else:
        restart_result = restart_opentrashmail()

    return {
        "ok": restart_result["ok"],
        "registry": registry,
        "summary": build_registry_summary(registry),
        "restart": restart_result,
        "message": (
            "根域名配置已保存，OpenTrashmail 正在后台重载应用。"
            if defer_restart
            else "根域名配置已保存并同步到 OpenTrashmail。"
        ) if restart_result["ok"] else "根域名配置已保存，但重载 OpenTrashmail 失败。",
        "persisted_token": bool(persisted_token),
    }


def apply_mail_bridge_settings(auth_token: str, *, defer_restart: bool = False) -> dict[str, Any]:
    next_token = str(auth_token or "").strip()
    if len(next_token) < 8:
        return {
            "ok": False,
            "message": "Bridge Token 至少需要 8 个字符。",
        }

    current = load_runtime_settings()
    update_env_file(persisted_token=next_token, public_base=current["public_base"])

    if defer_restart:
        restart_opentrashmail_async()
        restart_result = {
            "ok": True,
            "scheduled": True,
            "returncode": 0,
            "stdout": "",
            "stderr": "",
        }
    else:
        restart_result = restart_opentrashmail()

    return {
        "ok": restart_result["ok"],
        "api_base": current["public_base"],
        "auth_token": next_token,
        "restart": restart_result,
        "message": (
            "Bridge Token 已保存，OpenTrashmail 正在后台重载应用。"
            if defer_restart
            else "Bridge Token 已保存并同步到 OpenTrashmail。"
        ) if restart_result["ok"] else "Bridge Token 已写入，但重载 OpenTrashmail 失败。",
    }


class MailBridgeHandler(BaseHTTPRequestHandler):
    server_version = "MailBridge/2.0"

    def _send_json(self, status: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        try:
            self.wfile.write(body)
        except BrokenPipeError:
            return

    def _unauthorized(self) -> None:
        self._send_json(HTTPStatus.UNAUTHORIZED, {"ok": False, "message": "unauthorized"})

    def _read_json_body(self) -> dict[str, Any]:
        try:
            length = int(self.headers.get("Content-Length", "0") or "0")
        except ValueError:
            length = 0
        raw = self.rfile.read(length) if length > 0 else b""
        if not raw:
            return {}
        try:
            payload = json.loads(raw.decode("utf-8"))
        except Exception:
            return {}
        return payload if isinstance(payload, dict) else {}

    def _is_authorized(self) -> bool:
        settings = load_runtime_settings()
        auth_token = settings["auth_token"]
        auth = self.headers.get("Authorization", "")
        prefix = "Bearer "
        if auth_token and auth.startswith(prefix) and auth[len(prefix):].strip() == auth_token:
            return True
        return not auth_token

    def _is_admin_authorized(self) -> bool:
        settings = load_runtime_settings()
        auth = self.headers.get("Authorization", "")
        prefix = "Bearer "
        bearer = auth[len(prefix):].strip() if auth.startswith(prefix) else ""
        if settings["auth_token"] and bearer == settings["auth_token"]:
            return True
        admin_password = settings["admin_password"]
        if admin_password:
            if bearer == admin_password:
                return True
            if self.headers.get("X-Admin-Password", "").strip() == admin_password:
                return True
        return False

    def do_GET(self) -> None:  # noqa: N802
        started = time.perf_counter()
        parsed_url = urlparse(self.path)

        if parsed_url.path == "/healthz":
            summary = build_registry_summary(load_domain_registry())
            self._send_json(
                HTTPStatus.OK,
                {
                    "ok": True,
                    "service": "mail-bridge",
                    "data_root": str(DATA_ROOT),
                    "has_token": bool(load_runtime_settings()["auth_token"]),
                    "domain_summary": summary,
                },
            )
            return

        if parsed_url.path == "/api/admin/domains":
            if not self._is_admin_authorized():
                self._unauthorized()
                return
            registry = load_domain_registry()
            self._send_json(
                HTTPStatus.OK,
                {
                    "ok": True,
                    "registry": registry,
                    "summary": build_registry_summary(registry),
                },
            )
            return

        if parsed_url.path == "/api/admin/mail-bridge":
            if not self._is_admin_authorized():
                self._unauthorized()
                return
            self._send_json(HTTPStatus.OK, build_mail_bridge_settings_payload())
            return

        if parsed_url.path != "/api/latest":
            self._send_json(HTTPStatus.NOT_FOUND, {"ok": False, "message": "not found"})
            return

        if not self._is_authorized():
            self._unauthorized()
            return

        query = parse_qs(parsed_url.query)
        address = (query.get("address") or [""])[0].strip().lower()
        mailbox_dir = safe_mailbox_dir(address)
        if mailbox_dir is None:
            self._send_json(HTTPStatus.BAD_REQUEST, {"ok": False, "message": "address is required"})
            return

        if not mailbox_dir.exists() or not mailbox_dir.is_dir():
            self._send_json(
                HTTPStatus.OK,
                {
                    "ok": True,
                    "email": None,
                    "address": address,
                    "lookup_ms": round((time.perf_counter() - started) * 1000, 2),
                },
            )
            return

        latest_path = choose_latest_message_path(mailbox_dir)
        if latest_path is None:
            self._send_json(
                HTTPStatus.OK,
                {
                    "ok": True,
                    "email": None,
                    "address": address,
                    "lookup_ms": round((time.perf_counter() - started) * 1000, 2),
                },
            )
            return

        try:
            payload = json.loads(latest_path.read_text(encoding="utf-8", errors="replace"))
        except Exception as exc:
            self._send_json(
                HTTPStatus.INTERNAL_SERVER_ERROR,
                {"ok": False, "message": "internal error", "detail": str(exc)},
            )
            return

        email_payload = normalize_mail_record(address, latest_path, payload)
        self._send_json(
            HTTPStatus.OK,
            {
                "ok": True,
                "address": address,
                "email": email_payload,
                "lookup_ms": round((time.perf_counter() - started) * 1000, 2),
            },
        )

    def do_POST(self) -> None:  # noqa: N802
        parsed_url = urlparse(self.path)
        if parsed_url.path == "/api/admin/domains/save":
            if not self._is_admin_authorized():
                self._unauthorized()
                return
            payload = self._read_json_body()
            registry = normalize_registry_payload(payload)
            result = apply_registry(registry, defer_restart=True)
            self._send_json(HTTPStatus.OK if result["ok"] else HTTPStatus.INTERNAL_SERVER_ERROR, result)
            return

        if parsed_url.path == "/api/admin/mail-bridge/save":
            if not self._is_admin_authorized():
                self._unauthorized()
                return
            payload = self._read_json_body()
            result = apply_mail_bridge_settings(payload.get("auth_token") if isinstance(payload, dict) else "", defer_restart=True)
            self._send_json(HTTPStatus.OK if result["ok"] else HTTPStatus.BAD_REQUEST, result)
            return

        self._send_json(HTTPStatus.NOT_FOUND, {"ok": False, "message": "not found"})

    def log_message(self, format: str, *args: Any) -> None:
        return


def main() -> None:
    DOMAIN_REGISTRY_PATH.parent.mkdir(parents=True, exist_ok=True)
    server = ThreadingHTTPServer((HOST, PORT), MailBridgeHandler)
    print(f"[mail-bridge] listening on http://{HOST}:{PORT}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
