# Paperclip → Railway → agentswarm.co.uk: DONE

**As of 2026-04-24, ~14:15 BST**

## Live

- **https://www.agentswarm.co.uk** — serving 200 OK from Railway edge (europe-west4)
- **http(s)://agentswarm.co.uk** — 301 redirect → https://www.agentswarm.co.uk (GoDaddy parking forwarder)
- `PAPERCLIP_AUTH_PUBLIC_BASE_URL=https://www.agentswarm.co.uk` (Railway env, redeploy ran ~13:07 BST)
- Auth endpoints: `/api/auth/get-session` returns 401 unauthenticated (correct), `/auth` returns 200

## Verified

```
curl -si https://www.agentswarm.co.uk/health          → 200
curl -si https://www.agentswarm.co.uk/auth            → 200
curl -si https://www.agentswarm.co.uk/api/auth/get-session → 401 {"error":"Unauthorized"}
curl -si http://agentswarm.co.uk/                     → 301 → https://www.agentswarm.co.uk
curl -si https://agentswarm.co.uk/                    → 301 → https://www.agentswarm.co.uk
```

## Final config snapshot

### Railway service (paperclip)
- Project `5c22fb2e-7cc6-4421-b587-f30386643d03` / service `2a644735-accf-4b30-bad0-d5dc8fe4cdfe`
- Custom domain: `www.agentswarm.co.uk` → `irb2ll3w.up.railway.app` (port 8080)
- Auto-deploy: GitHub `main` branch
- Postgres: managed Railway Postgres (`DATABASE_URL` from `${{Postgres.DATABASE_URL}}`)

### GoDaddy DNS (agentswarm.co.uk)
- `CNAME www → irb2ll3w.up.railway.app`
- `TXT _railway-verify.www → railway-verify=13790542ab7ca66028736ba9cdfd0edba417e2be0255e114e3c18228476acb1c`
- Forwarding (apex): `agentswarm.co.uk → https://www.agentswarm.co.uk` (Permanent 301, no masking)

## Manual smoke test (you do this)

1. Visit https://www.agentswarm.co.uk/auth → sign up with email
2. After login → `/INS/dashboard` (or whatever org slug it routes to)
3. Install "The Agent Collective" template
4. Trigger a delegation, confirm it runs
