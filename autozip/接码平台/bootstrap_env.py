#!/usr/bin/env python3
import os
from pathlib import Path


RUNTIME_ENV_PATH = Path("/var/www/opentrashmail/runtime.env")
START_SCRIPT = "/etc/start.sh"


def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ[key.strip()] = value.strip()


def main() -> None:
    load_env_file(RUNTIME_ENV_PATH)
    os.execv(START_SCRIPT, [START_SCRIPT])


if __name__ == "__main__":
    main()
