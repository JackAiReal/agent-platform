# Agent Platform

A LAN-ready dashboard to track daily agent work, outputs, costs, and review workflow.

## Features

- Vben-style dark sidebar + clean dashboard layout
- Login page + cookie session auth
- Modules:
  - Agent Diary
  - Output List
  - Cost Tracking
- Structured diary template: goal/action/result/next step
- Image upload support
- Search + date + review status filters
- Review workflow: pending / approved / rejected + review note
- Daily/weekly PDF export for diary
- JSON export endpoint for full data backup
- Auto backup (`data/backups`) with rotation (keep latest 30)
- 14-day trend chart + pending review queue

## Quick Start

```bash
cd agent-platform
cp .env.example .env
npm install
npm start
```

Open:

- Local: `http://127.0.0.1:8001`
- LAN: `http://<your-lan-ip>:8001`

## Environment Variables

| Name | Default | Description |
|---|---|---|
| `PORT` | `8001` | HTTP port |
| `HOST` | `0.0.0.0` | Bind host |
| `DASHBOARD_USER` | `admin` | Login username |
| `DASHBOARD_PASSWORD` | random at boot | Login password |
| `SESSION_SECRET` | random at boot | Session signing secret |

> If `DASHBOARD_PASSWORD` is not provided, the server prints a one-time generated password in logs.

## API Overview

- `POST /login`
- `POST /logout`
- `POST /api/upload`
- `GET /api/entries?type=&q=&date=&reviewStatus=`
- `POST /api/entries`
- `PATCH /api/entries/:id/review`
- `GET /api/summary`
- `GET /api/timeline`
- `GET /api/export.json`

## Data

- Main DB: `data/db.json`
- Backups: `data/backups/*.json`
- Uploads: `public/uploads/*`

## Open Source Notes

- Keep secrets in `.env` (do not commit)
- Uploaded images and runtime backups are git-ignored by default
