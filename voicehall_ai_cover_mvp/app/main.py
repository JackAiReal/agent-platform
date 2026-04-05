from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import DATA_DIR, UPLOAD_DIR
from app.models import CoverTask, now_iso
from app.services.store import TaskStore
from app.services.task_manager import TaskManager

app = FastAPI(title="VoiceHall AI Cover MVP", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

store = TaskStore()
manager = TaskManager(store)

app.mount("/files", StaticFiles(directory=str(DATA_DIR)), name="files")


@app.on_event("startup")
def on_startup():
    manager.start()


@app.on_event("shutdown")
def on_shutdown():
    manager.stop()


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/covers/tasks")
async def create_cover_task(
    source: UploadFile = File(..., description="歌曲音频文件"),
    song_name: str = Form(default=""),
    voice_model: str = Form(default="default_voice"),
    pitch_shift: int = Form(default=0),
):
    task_id = uuid4().hex

    suffix = Path(source.filename or "source.wav").suffix or ".wav"
    save_path = UPLOAD_DIR / f"{task_id}{suffix}"
    content = await source.read()
    save_path.write_bytes(content)

    task = CoverTask(
        task_id=task_id,
        song_name=song_name or Path(source.filename or "untitled").stem,
        source_filename=source.filename or "source",
        source_path=str(save_path),
        voice_model=voice_model,
        pitch_shift=pitch_shift,
        status="queued",
        created_at=now_iso(),
        updated_at=now_iso(),
        progress=0,
        message="已入队",
    )
    store.add(task)
    manager.enqueue(task_id)
    return task.to_dict()


@app.get("/covers/tasks")
def list_cover_tasks(limit: int = 20):
    tasks = [t.to_dict() for t in store.list()[:limit]]
    return {"items": tasks, "count": len(tasks)}


@app.get("/covers/tasks/{task_id}")
def get_cover_task(task_id: str):
    task = store.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="task not found")
    return task.to_dict()


@app.get("/covers/tasks/{task_id}/result")
def get_cover_result(task_id: str):
    task = store.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="task not found")
    if task.status != "success" or not task.result_url:
        raise HTTPException(status_code=400, detail=f"task status={task.status}")
    return {
        "task_id": task_id,
        "song_name": task.song_name,
        "result_url": task.result_url,
    }
