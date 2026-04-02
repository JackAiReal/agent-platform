#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import argparse
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request


TEST_URLS = [
    "http://httpbin.org/ip",
    "https://httpbin.org/ip",
    "https://api.ipify.org?format=json",
    "https://ifconfig.me/ip",
    "https://cloudflare.com/cdn-cgi/trace",
    "https://auth.openai.com/cdn-cgi/trace",
]


def mask_proxy(proxy_url: str) -> str:
    try:
        u = urllib.parse.urlparse(proxy_url)
        if u.username:
            return f"{u.scheme}://{u.username}:***@{u.hostname}:{u.port}"
        return proxy_url
    except Exception:
        return proxy_url


def build_proxy_url(raw: str, default_scheme: str = "http") -> str:
    raw = (raw or "").strip()
    if not raw:
        raise ValueError("empty proxy")

    if "://" in raw:
        return raw

    parts = raw.split(":", 3)
    if len(parts) != 4:
        raise ValueError("proxy must be host:port:user:pass or full url")

    host, port, user, pwd = parts
    user = urllib.parse.quote(user, safe="")
    pwd = urllib.parse.quote(pwd, safe="")
    return f"{default_scheme}://{user}:{pwd}@{host}:{port}"


def fetch_pick_proxy(pick_url: str, timeout: int = 15, default_scheme: str = "http") -> str:
    req = urllib.request.Request(
        pick_url,
        headers={"User-Agent": "Mozilla/5.0", "Accept": "text/plain,*/*"},
        method="GET",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read().decode("utf-8", "replace").strip()

    lines = [x.strip().strip("\"'") for x in raw.replace("\r", "\n").split("\n") if x.strip()]
    if not lines:
        raise RuntimeError("pick api returned empty content")

    return build_proxy_url(lines[0], default_scheme=default_scheme)


def open_url(url: str, proxy_url: str, timeout: int = 20):
    proxy_handler = urllib.request.ProxyHandler({
        "http": proxy_url,
        "https": proxy_url,
    })

    ctx = ssl.create_default_context()
    opener = urllib.request.build_opener(
        proxy_handler,
        urllib.request.HTTPSHandler(context=ctx),
    )

    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0",
            "Accept": "*/*",
        },
        method="GET",
    )

    start = time.time()
    with opener.open(req, timeout=timeout) as resp:
        body = resp.read().decode("utf-8", "replace")
        cost = time.time() - start
        return resp.status, body, cost


def main():
    parser = argparse.ArgumentParser(description="Test whether an HTTP proxy is usable.")
    parser.add_argument("--proxy", help="full proxy url or host:port:user:pass")
    parser.add_argument("--pick-url", help="Kookeey pick api url")
    parser.add_argument("--scheme", default="http", choices=["http", "https"], help="default scheme")
    parser.add_argument("--timeout", type=int, default=20, help="request timeout seconds")
    args = parser.parse_args()

    if not args.proxy and not args.pick_url:
        print("Use either --proxy or --pick-url")
        sys.exit(2)

    try:
        if args.pick_url:
            proxy_url = fetch_pick_proxy(args.pick_url, timeout=args.timeout, default_scheme=args.scheme)
            print(f"[INFO] picked proxy: {mask_proxy(proxy_url)}")
        else:
            proxy_url = build_proxy_url(args.proxy, default_scheme=args.scheme)
            print(f"[INFO] proxy: {mask_proxy(proxy_url)}")
    except Exception as e:
        print(f"[ERROR] failed to get proxy: {e}")
        sys.exit(1)

    print()

    ok = 0
    for url in TEST_URLS:
        print(f"==> {url}")
        try:
            status, body, cost = open_url(url, proxy_url, timeout=args.timeout)
            print(f"STATUS: {status} | TIME: {cost:.2f}s")
            print(body[:400].replace("\n", "\\n"))
            ok += 1
        except urllib.error.HTTPError as e:
            try:
                body = e.read().decode("utf-8", "replace")
            except Exception:
                body = ""
            print(f"HTTP ERROR: {e.code}")
            if body:
                print(body[:400].replace("\n", "\\n"))
        except Exception as e:
            print(f"ERROR: {repr(e)}")
        print()

    print(f"[SUMMARY] success={ok}/{len(TEST_URLS)}")
    if ok == 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
