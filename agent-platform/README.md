# Agent Platform

A LAN-ready dashboard to track daily agent work, outputs, costs, and review workflow.

English README: `README.en.md`

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
- 定时任务列表（读取 OpenClaw cron，支持刷新/启停/删除/立即运行）
- 一键创建默认日记任务（每天 12:00 与 23:00）

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
- Project landing page: `http://<your-lan-ip>:8001/project`

## Environment Variables

| Name | Default | Description |
|---|---|---|
| `PORT` | `8001` | HTTP port |
| `HOST` | `0.0.0.0` | Bind host |
| `DASHBOARD_USER` | `admin` | Login username |
| `DASHBOARD_PASSWORD` | random at boot | Login password |
| `SESSION_SECRET` | random at boot | Session signing secret |
| `TELEGRAM_BOT_TOKEN` | (empty) | Optional: Telegram bot token for push |
| `TELEGRAM_CHAT_ID` | (empty) | Optional: Telegram target chat ID |
| `ENTRY_WEBHOOK_URL` | (empty) | Optional: generic webhook URL called on new entry |
| `X_WEBHOOK_URL` | (empty) | Optional: X relay webhook URL called on new entry |

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
- `GET /api/schedules`
- `POST /api/schedules/bootstrap`
- `POST /api/schedules/:id/run`
- `PATCH /api/schedules/:id`
- `DELETE /api/schedules/:id`
- `GET /api/export.json`

## Data

- Main DB: `data/db.json`
- Backups: `data/backups/*.json`
- Uploads: `public/uploads/*`

## Open Source Notes

- Keep secrets in `.env` (do not commit)
- Uploaded images and runtime backups are git-ignored by default
