# AgriMind — Grow Smarter. Farm Better.

AI-powered agriculture web app: a scroll-controlled cinematic landing page, a dashboard and five
tools built on the existing AgriMind models, plus the AgriMind Assistant (Gemini, via `chatbot.py`).

| Route | Tool | Model (from the AgriMind ML folder) |
|---|---|---|
| `/` | Cinematic landing page | frames extracted from `assets-src/hero/agrimind-hero.mp4` |
| `/dashboard` | Overview of your saved records | — |
| `/production` | Crop Production (yield estimate + season tracking) | `predict_production.py` → `crop_production_model.pkl` |
| `/irrigation` | Pre-Irrigation (8 plain questions) | `predict_irrigation.py` → `irrigation_model.pkl` |
| `/leaf-prediction` | Leaf Prediction (photo) | `scripts/predict.py` → `models/plant_disease_model.keras` |
| `/crop-price` | Crop Price (mandi estimate) | `predict_price.py` → `daily_price_model.pkl` |
| `/crop-analysis` | Crop Analysing (best crop) | `predict_crop.py` → `crop_rec_model.pkl` |
| `/settings` | Farmer profile, account, system status | — |

## Layout

```
assets-src/          original hero video + character reference (source assets, not loaded by the page)
scripts/extract_frames.py   rebuilds the hero frame sequence from the video (needs ffmpeg)
backend/             FastAPI + SQLAlchemy (MySQL, SQLite fallback)
  app/ml/            one service per model: options, "What you need" guide, prediction wrapper
  app/routers/       API routes      app/services/  assistant wrapper, activity log
  schema.sql         MySQL DDL (tables are also created automatically on startup)
frontend/            React + TypeScript + Vite + Tailwind + Recharts
  public/assets/hero-frames/   160 numbered WebP frames (desktop 1440 px, mobile 768 px) + manifest.json
```

The models are **not copied**: the backend imports them from `AGRIMIND_ML_DIR` (the existing AgriMind
folder) and calls their functions unchanged. If a model file is missing, that tool shows
"not configured yet" — predictions are never invented.

## Run (development)

```bash
# 1. backend
cd backend
pip install -r requirements.txt
cp .env.example .env          # set AGRIMIND_ML_DIR, DB_* and (optionally) Gemini_Api_Key
python run.py                 # http://127.0.0.1:8000/docs

# 2. frontend (second terminal)
cd frontend
npm install
npm run dev                   # http://localhost:5173  (proxies /api to :8000)
```

Production: `cd frontend && npm run build`, then `python backend/run.py` serves both the API and the
built site on port 8000.

## Database (MySQL)

```sql
CREATE DATABASE agrimind CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'agrimind'@'localhost' IDENTIFIED BY 'choose-a-strong-password';
GRANT ALL PRIVILEGES ON agrimind.* TO 'agrimind'@'localhost';
```

Put the password in `backend/.env` (`DB_PASSWORD=`). Tables are created on startup; `backend/schema.sql`
has the same DDL for manual setup. **If `DB_PASSWORD` is empty, a local SQLite file
(`backend/data/agrimind.db`) is used instead** and Settings → System status shows "local SQLite".

Accounts: every browser gets a private guest account automatically (its token is the only key to
its records). A guest can create a username/password to keep the records; passwords are hashed with
scrypt and every query is filtered by the signed-in user. Settings → "Delete my data" removes the
account and all its records.

## Hero frames

```bash
npm run extract-frames        # from frontend/, or: python scripts/extract_frames.py --fps 16
```

The zone timings (which seconds show which tool) are in `scripts/extract_frames.py` and were checked
against a timestamped contact sheet of the video. Requires ffmpeg (`winget install ffmpeg`).

## API

Interactive reference at `/docs`. Main endpoints: `GET /api/health`, `GET /api/guide/{tool}`,
`GET /api/options/{tool}`, `GET /api/resolve/{tool}`, `POST /api/production/estimate`,
`POST|GET|PUT|DELETE /api/production/...`, `POST /api/irrigation/quick`, `POST /api/leaf/predict`,
`POST /api/market/estimate`, `GET /api/market/prices`, `POST /api/crops/recommend`,
`GET /api/dashboard/summary`, `GET /api/dashboard/activity`, `POST /api/chat`, `POST /api/chat/image`.
Errors always come back as `{"error": {"message", "code", "detail"}}`.

## Known limits (shown in the UI)

- Price data is a single-day snapshot with no dates: no real price history or trend is drawn.
- Production data covers about 1997–2015; later years use the latest pattern.
- Irrigation and crop-recommendation datasets are clean/synthetic; real fields may differ.
- No weather API is configured, so weather values are entered by the farmer.
