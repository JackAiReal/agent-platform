import json
import threading
from pathlib import Path
from typing import Dict, List, Optional

from app.config import TASK_DB_PATH
from app.models import CoverTask


class TaskStore:
    def __init__(self, db_path: Path = TASK_DB_PATH):
        self.db_path = db_path
        self._lock = threading.Lock()
        self._tasks: Dict[str, CoverTask] = {}
        self._load()

    def _load(self):
        if not self.db_path.exists():
            return
        try:
            raw = json.loads(self.db_path.read_text(encoding="utf-8"))
            for item in raw:
                task = CoverTask(**item)
                self._tasks[task.task_id] = task
        except Exception:
            # Best-effort load for MVP; corrupted file won't block service startup.
            self._tasks = {}

    def _save(self):
        payload = [t.to_dict() for t in self._tasks.values()]
        self.db_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    def add(self, task: CoverTask):
        with self._lock:
            self._tasks[task.task_id] = task
            self._save()

    def get(self, task_id: str) -> Optional[CoverTask]:
        with self._lock:
            return self._tasks.get(task_id)

    def list(self) -> List[CoverTask]:
        with self._lock:
            return sorted(self._tasks.values(), key=lambda x: x.created_at, reverse=True)

    def update(self, task_id: str, **kwargs) -> Optional[CoverTask]:
        with self._lock:
            task = self._tasks.get(task_id)
            if not task:
                return None
            for k, v in kwargs.items():
                setattr(task, k, v)
            self._save()
            return task
