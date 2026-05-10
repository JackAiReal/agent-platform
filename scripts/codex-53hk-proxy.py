#!/usr/bin/env python3
"""
Codex Responses API → 53hk Chat Completions 转发代理
用法: python3 codex-53hk-proxy.py
默认监听 :8080
"""

import json, os, sys
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError
import threading

LISTEN_HOST = "0.0.0.0"
LISTEN_PORT = 8787
UPSTREAM_BASE = "https://api.53hk.cn/v1"
API_KEY = os.environ.get("MINIMAX53_API_KEY", "").strip()
DEBUG = True

def responses_to_chat(req_body):
    """把 Codex Responses 格式转成 Chat Completions 格式"""
    messages = []
    system_parts = []

    for msg in req_body.get("input", []):
        role = msg.get("role", "user")
        for part in msg.get("content", []):
            ct = part.get("type", "")
            if ct == "input_text":
                text = part.get("text", "")
                # 跳过 Codex 的特殊系统消息，上游不支持
                if role == "developer" and ("permissions" in text or "sandbox" in text or "writable_roots" in text or "collaboration_mode" in text):
                    continue
                if role == "system":
                    system_parts.append(text)
                else:
                    messages.append({"role": role, "content": text})
            elif ct == "input_image":
                # Codex 传的是 image URL，53hk 需要 url 或 base64
                img_url = part.get("image_url", {}).get("url", "")
                if img_url:
                    messages.append({"role": role, "content": f"[image: {img_url}]"})

    if not messages:
        messages.append({"role": "user", "content": "ping"})

    model = req_body.get("model", "MiniMax-M2.7-highspeed")
    # 去掉 provider 前缀
    if "/" in model:
        model = model.split("/")[-1]

    chat_req = {
        "model": model,
        "messages": messages,
        "stream": False,
    }

    # temperature
    if "temperature" in req_body:
        chat_req["temperature"] = req_body["temperature"]

    # max_tokens
    if "max_output_tokens" in req_body:
        chat_req["max_tokens"] = req_body["max_output_tokens"]

    return chat_req

def chat_to_responses(chat_resp_text, original_model):
    """把 Chat Completions 响应转回 Responses 格式"""
    try:
        resp_data = json.loads(chat_resp_text)
    except Exception:
        return {
            "error": {
                "type": "server_error",
                "message": "Failed to parse upstream response"
            }
        }

    content = []
    if "choices" in resp_data:
        for choice in resp_data["choices"]:
            msg = choice.get("message", {})
            if msg.get("content"):
                content.append({
                    "type": "output_text",
                    "text": msg["content"]
                })
    elif "error" in resp_data:
        return resp_data

    return {
        "object": "response",
        "id": resp_data.get("id", "proxy-local"),
        "model": original_model,
        "created": resp_data.get("created", 0),
        "choices": [{
            "type": "message",
            "index": 0,
            "message": {
                "role": "assistant",
                "content": content
            }
        }],
        "usage": resp_data.get("usage", {})
    }

class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True
    allow_reuse_address = True

class ProxyHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, format, *args):
        if DEBUG:
            sys.stderr.write(f"[codex-proxy] {args[0]}\n")

    def do_POST(self):
        if self.path != "/v1/responses":
            self.send_error_response(404, "Not Found", f"Only /v1/responses is supported, got {self.path}")
            return

        if not API_KEY:
            self.send_error_response(500, "Server Error", "MINIMAX53_API_KEY environment variable not set")
            return

        # 读取请求体
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length) if content_length > 0 else b"{}"
        try:
            req_body = json.loads(body.decode("utf-8"))
        except Exception:
            self.send_error_response(400, "Bad Request", "Invalid JSON body")
            return

        # 转换格式
        chat_req = responses_to_chat(req_body)
        if DEBUG:
            print(f"[codex-proxy] → UPSTREAM: {json.dumps(chat_req, ensure_ascii=False)[:300]}", file=sys.stderr)

        # 转发到 53hk
        upstream_url = f"{UPSTREAM_BASE}/chat/completions"
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {API_KEY}"
        }
        upstream_req = Request(
            upstream_url,
            data=json.dumps(chat_req).encode("utf-8"),
            headers=headers,
            method="POST"
        )

        try:
            with urlopen(upstream_req, timeout=120) as upstream_resp:
                upstream_data = upstream_resp.read().decode("utf-8")
                self.send_response(upstream_resp.status)
                self.send_header("Content-Type", "application/json")
                self.send_header("X-Proxy", "codex-53hk-local")
                self.end_headers()
                self.wfile.write(upstream_data.encode("utf-8"))
        except HTTPError as e:
            err_body = e.read().decode("utf-8", "replace")
            self.send_response(e.code)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(err_body.encode("utf-8"))
        except URLError as e:
            self.send_error_response(502, "Bad Gateway", f"Upstream error: {e.reason}")
        except Exception as e:
            self.send_error_response(500, "Server Error", str(e))

    def send_error_response(self, code, phrase, message):
        body = json.dumps({"error": {"type": phrase.lower().replace(" ", "_"), "message": message}})
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(body.encode("utf-8"))

    def do_GET(self):
        if self.path == "/health":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"status": "ok", "upstream": UPSTREAM_BASE}).encode())
        else:
            self.send_error_response(404, "Not Found", f"GET {self.path} not supported")

def main():
    if not API_KEY:
        print("⚠️  MINIMAX53_API_KEY environment variable not set.", file=sys.stderr)
        print("   Run: set MINIMAX53_API_KEY=sk-your-key", file=sys.stderr)
        print("   On Windows CMD: set MINIMAX53_API_KEY=sk-your-key", file=sys.stderr)
        print("   On PowerShell: $env:MINIMAX53_API_KEY='sk-your-key'", file=sys.stderr)

    print(f"[codex-proxy] Starting on http://{LISTEN_HOST}:{LISTEN_PORT}")
    print(f"[codex-proxy] Upstream: {UPSTREAM_BASE}")
    print(f"[codex-proxy] API Key: {'✓ set' if API_KEY else '✗ NOT SET'}")
    server = ThreadedHTTPServer((LISTEN_HOST, LISTEN_PORT), ProxyHandler)
    print(f"[codex-proxy] Ready — Codex endpoint: http://{LISTEN_HOST}:{LISTEN_PORT}/v1/responses")
    sys.stderr.flush()
    server.serve_forever()

if __name__ == "__main__":
    main()
