import queue
import threading
import traceback
from pathlib import Path

from app.config import RESULT_DIR
from app.models import now_iso
from app.services.pipeline import run_pipeline
from app.services.store import TaskStore


class TaskManager:
    def __init__(self, store: TaskStore):
        self.store = store
        self.q: queue.Queue[str] = queue.Queue()
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()

    def start(self):
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._worker, daemon=True)
        self._thread.start()

    def stop(self):
        self._stop.set()
        self.q.put("__STOP__")
        if self._thread:
            self._thread.join(timeout=2)

    def enqueue(self, task_id: str):
        self.q.put(task_id)

    def _worker(self):
        while not self._stop.is_set():
            task_id = self.q.get()
            if task_id == "__STOP__":
                break

            task = self.store.get(task_id)
            if not task:
                continue

            self.store.update(task_id, status="running", updated_at=now_iso(), progress=5, message="任务开始")

            def progress_cb(value: int, message: str):
                self.store.update(task_id, progress=value, message=message, updated_at=now_iso())

            try:
                task_result_dir = RESULT_DIR / task_id
                task_result_dir.mkdir(parents=True, exist_ok=True)

                out_mp3 = run_pipeline(
                    source_path=Path(task.source_path),
                    work_dir=task_result_dir,
                    voice_model=task.voice_model,
                    pitch_shift=task.pitch_shift,
                    progress=progress_cb,
                )

                self.store.update(
                    task_id,
                    status="success",
                    updated_at=now_iso(),
                    progress=100,
                    message="任务完成",
                    result_path=str(out_mp3),
                    result_url=f"/files/results/{task_id}/cover.mp3",
                    error=None,
                )
            except Exception as e:
                self.store.update(
                    task_id,
                    status="failed",
                    updated_at=now_iso(),
                    message="任务失败",
                    error=f"{e}\n{traceback.format_exc()[-1200:]}",
                )
