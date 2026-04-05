from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from typing import Optional


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class CoverTask:
    task_id: str
    song_name: str
    source_filename: str
    source_path: str
    voice_model: str
    pitch_shift: int
    status: str
    created_at: str
    updated_at: str
    progress: int = 0
    message: str = ""
    result_path: Optional[str] = None
    result_url: Optional[str] = None
    error: Optional[str] = None

    def to_dict(self):
        return asdict(self)
