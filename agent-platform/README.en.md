# Agent Platform (English)

A LAN-ready dashboard for tracking agent diaries, outputs, costs, schedule jobs, and review workflow.

## Highlights

- Chinese/English UI switch (sidebar toggle)
- Schedule list backed by OpenClaw cron jobs
- One-click bootstrap for 12:00 and 23:00 diary jobs
- Trigger/enable/disable/delete schedule jobs from UI
- Auto webhook push when a new diary/output/cost entry is created
- Public project landing page (`/project`) for onboarding and quick start

## Quick Start

```bash
cd agent-platform
cp .env.example .env
npm install
npm start
```

Open:

- Console: `http://127.0.0.1:8001/login`
- Landing page: `http://127.0.0.1:8001/project`

## Environment Variables

- `PORT` (default `8001`)
- `HOST` (default `0.0.0.0`)
- `DASHBOARD_USER`
- `DASHBOARD_PASSWORD`
- `SESSION_SECRET`
- `TELEGRAM_BOT_TOKEN` (optional)
- `TELEGRAM_CHAT_ID` (optional)
- `ENTRY_WEBHOOK_URL` (optional generic webhook)
- `X_WEBHOOK_URL` (optional X relay webhook)

## Webhook Payload

When an entry is created, webhooks receive JSON:

```json
{
  "source": "entry_webhook",
  "event": "entry.created",
  "at": "2026-02-20T12:00:00.000Z",
  "entry": { "id": "...", "type": "diary", "title": "..." },
  "text": "[diary] title ..."
}
```

> Note: Direct posting to X requires OAuth flow. `X_WEBHOOK_URL` is intended for your own relay service.
