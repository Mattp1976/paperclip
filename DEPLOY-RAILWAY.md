# Deploying Paperclip to Railway

> **⚠️ USE `DEPLOY-RAILWAY-CLI.md` INSTEAD.**
> Railway's dashboard auto-detects our `pnpm-workspace.yaml` and tries to create one service per workspace package, which is wrong. The CLI path bypasses that and is a 5-command recipe. This dashboard runbook is kept only for reference.

Step-by-step runbook for getting Paperclip live on a public web domain today.

The repo is already production-shaped for this: `Dockerfile` builds the server + UI as a single container, server serves the built UI as static files, migrations auto-apply on boot, `PAPERCLIP_DEPLOYMENT_MODE=authenticated` is the default in the image, health endpoint is at `/health`, Better-Auth is wired. The only things to configure are secrets, a managed Postgres, and the custom domain.

## Sequence

### 1. Generate your auth secret

On your local machine, run:

```bash
openssl rand -hex 32
```

Copy the output. Paste it into your password manager labelled `PAPERCLIP_BETTER_AUTH_SECRET` — you'll need it in a minute and you'll need it again if you ever redeploy.

### 2. Push to a GitHub repo

Railway deploys from GitHub. If the repo isn't already on GitHub, push it:

```bash
cd "/Users/mattparry/Desktop/Future Collective/paperclip-build"
git remote -v  # confirm origin is what you expect
git push
```

### 3. Create the Railway project

1. Go to <https://railway.app/new>.
2. Pick **Deploy from GitHub repo** → authorise Railway → pick the paperclip repo.
3. Railway will detect the `Dockerfile` and start building. Let it — we'll configure after the first build completes (it'll fail or boot in `local_trusted` mode without a DB, both fine).

### 4. Add a managed Postgres

1. In your Railway project, click **+ New** → **Database** → **Add PostgreSQL**.
2. Railway provisions it and exposes a `DATABASE_URL` internally.
3. Click your paperclip service → **Variables** → **Add Reference** → select the Postgres service's `DATABASE_URL` variable. Railway wires them together.

### 5. Set environment variables

On the paperclip service → **Variables**, add:

| Key | Value |
|---|---|
| `BETTER_AUTH_SECRET` | The hex string from step 1 |
| `PAPERCLIP_DEPLOYMENT_MODE` | `authenticated` |
| `PAPERCLIP_DEPLOYMENT_EXPOSURE` | `public` |
| `PAPERCLIP_AUTH_PUBLIC_BASE_URL` | `https://<your-domain>` — leave blank for now, set after step 7 |
| `PAPERCLIP_STORAGE_PROVIDER` | `local` (switch to `s3` later if needed) |
| `PAPERCLIP_SECRETS_PROVIDER` | `env` |

Leave `DATABASE_URL` alone — Railway's reference from step 4 handles it.

Railway redeploys automatically on every variable change. Watch the deploy log.

### 6. Add the healthcheck

Service → **Settings** → **Healthcheck Path**: `/health`. Save.

### 7. Connect the custom domain

1. Service → **Settings** → **Networking** → **Custom Domain** → enter your domain (e.g. `paperclip.future-collective.co.uk`).
2. Railway gives you a CNAME target like `<something>.up.railway.app`.
3. In your domain's DNS (Cloudflare / wherever `future-collective.co.uk` is managed), add a **CNAME** record:
   - Name: `paperclip` (or whatever subdomain)
   - Target: the Railway CNAME target
   - TTL: automatic / default
4. Wait 2-10 minutes for propagation and cert issuance. Railway auto-provisions the TLS cert.
5. Back in Railway variables, update `PAPERCLIP_AUTH_PUBLIC_BASE_URL` to `https://<your-domain>` (exact, no trailing slash). Railway will redeploy.

### 8. Create the first user

Hit `https://<your-domain>` in a browser. You'll land on the Better-Auth sign-up screen. Create your account — the first user typically becomes the instance admin (confirm via `server/src/middleware/auth.ts` if you want to verify the exact path).

### 9. Sanity check

- `/health` should return 200.
- Sign in works.
- Create a company. Install the "Agent Collective" fleet template. Route a task. Confirm it hits an agent and runs.
- Standup page loads.

If any of those fail, check the Railway deploy logs first — migrations and startup banner print clearly.

## Cost expectations

- Railway Postgres: starts at ~$5/mo (Hobby plan includes $5 credit).
- Service: ~$5-10/mo depending on usage.
- Total for a dogfood deployment: under $15/mo.

## If it doesn't work

Most common failure modes:

1. **`/health` times out on first deploy** — migrations can take a minute on a cold DB. Bump Railway's healthcheck timeout to 300s in Settings → Deploy.
2. **401 on every request** — `PAPERCLIP_DEPLOYMENT_MODE` is wrong or `BETTER_AUTH_SECRET` is missing. Check variables.
3. **UI loads but API calls 404** — the container built without the UI. Check build logs for `pnpm --filter @orqestra/ui build` success.
4. **Data disappears on redeploy** — you're accidentally on embedded Postgres instead of the managed one. Confirm `DATABASE_URL` is wired via the reference, not blank.

## After it's live

- Update `HANDOFF-30D.md` — item #30 (release dispatch) is now "deploy to web" not "cut desktop DMG". Adjust if that reframes the rest.
- Decide whether to publish `posts/drafts/category-naming.md` — with a live URL, the post has somewhere to point to.
- The W4 demo video (#26) can now be recorded against the live URL instead of a local desktop build. One-take, one real task, one agent.
