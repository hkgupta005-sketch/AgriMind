"""Settings read from backend/.env (and the real environment, which wins)."""

import os
import sys
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import dotenv_values

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:  # the ML loader changes the working directory
    sys.path.insert(0, str(BACKEND_DIR))

# Only copy non-empty values: an empty "Gemini_Api_Key=" must not hide the key that
# chatbot.py loads from the AgriMind folder's own .env.
for _key, _value in dotenv_values(BACKEND_DIR / ".env").items():
    if _value not in (None, "") and _key not in os.environ:
        os.environ[_key] = _value


def _bool(name, default):
    return os.getenv(name, str(default)).strip().lower() in ("1", "true", "yes", "on")


REPO_DIR = BACKEND_DIR.parent          # on Render: /opt/render/project/src


def _ml_dir():
    """AGRIMIND_ML_DIR if it exists, else the repository root (where the predict_*.py files live)."""
    raw = os.getenv("AGRIMIND_ML_DIR", "").strip()
    if raw:
        path = Path(raw).expanduser()
        if not path.is_absolute():
            path = (BACKEND_DIR / path).resolve()
        if path.is_dir():
            return path
        print(f"AGRIMIND_ML_DIR={raw} does not exist, using {REPO_DIR}", file=sys.stderr)
    return REPO_DIR


def _db_mode():
    """mysql (DB_PASSWORD set), sqlite (local default) or none (DB_MODE=none, default on Render,
    whose disk is wiped on every restart)."""
    mode = os.getenv("DB_MODE", "").strip().lower()
    if mode in ("mysql", "sqlite", "none"):
        return mode
    if os.getenv("DB_PASSWORD"):
        return "mysql"
    return "none" if os.getenv("RENDER") else "sqlite"


@dataclass(frozen=True)
class Settings:
    ml_dir: Path = field(default_factory=_ml_dir)
    db_host: str = os.getenv("DB_HOST", "127.0.0.1")
    db_port: int = int(os.getenv("DB_PORT", "3306"))
    db_name: str = os.getenv("DB_NAME", "agrimind")
    db_user: str = os.getenv("DB_USER", "agrimind")
    db_password: str = os.getenv("DB_PASSWORD", "")
    db_mode: str = field(default_factory=_db_mode)
    sqlite_path: Path = BACKEND_DIR / "data" / "agrimind.db"
    cors_origins: tuple = tuple(o.strip().rstrip("/") for o in os.getenv(
        "CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if o.strip())
    # any Render site (e.g. https://agrimind-xyz.onrender.com) may call the API
    cors_origin_regex: str = os.getenv("CORS_ORIGIN_REGEX", r"https://[a-z0-9-]+\.onrender\.com")
    leaf_enabled: bool = _bool("LEAF_MODEL_ENABLED", True)
    preload_leaf_model: bool = _bool("PRELOAD_LEAF_MODEL", True)
    chat_rate_limit: int = int(os.getenv("CHAT_RATE_LIMIT_PER_MIN", "12"))
    chat_timeout_s: int = int(os.getenv("CHAT_TIMEOUT_S", "120"))  # Gemini + tools can take >60 s
    max_upload_bytes: int = 8 * 1024 * 1024
    session_days: int = 60
    upload_dir: Path = BACKEND_DIR / "data" / "uploads"

    @property
    def use_mysql(self) -> bool:
        return self.db_mode == "mysql"

    @property
    def use_db(self) -> bool:
        return self.db_mode != "none"

    @property
    def database_url(self) -> str:
        if self.use_mysql:
            from urllib.parse import quote_plus
            return (f"mysql+mysqlconnector://{quote_plus(self.db_user)}:{quote_plus(self.db_password)}"
                    f"@{self.db_host}:{self.db_port}/{self.db_name}?charset=utf8mb4")
        return f"sqlite:///{self.sqlite_path.as_posix()}"


settings = Settings()
settings.upload_dir.mkdir(parents=True, exist_ok=True)
