# Ship Paperclip to Railway — 5-command recipe

When you're back from your meeting, paste these into a terminal in this repo. Total time: ~5 min.

The Railway dashboard's auto-detect keeps trying to stage one service per pnpm workspace package (wrong). CLI bypasses that — we use the `railway.json` in the repo root and upload the current directory as the build context. **No git push required** (though you can still push for cleanliness afterwards).

## Context: what already exists

- `railway.json` is committed locally (not pushed) — tells Railway to use our root `Dockerfile`
- An empty Railway project already exists:
  - Project: `5c22fb2e-7cc6-4421-b587-f30386643d03`
  - Service: `e39ea129-e158-40f3-918e-17a5834f16df` (named `poetic-vision`)
  - Env: `4a128e95-707d-4778-b14f-c8b35c28737a` (production)
- We'll link to this project and deploy into it. Postgres still needs to be added.

## The 5 commands

```bash
# 1. Install + auth (one-time; opens browser for login)
brew install railway && railway login

# 2. From the repo root, link to the existing empty project
cd "/Users/mattparry/Desktop/Future Collective/paperclip-build"
railway link --project 5c22fb2e-7cc6-4421-b587-f30386643d03 --service poetic-vision --environment production

# 3. Add managed Postgres (creates a new service in the same project; DATABASE_URL is referenced from there)
railway add --database postgres

# 4. Set env vars (one chained command; BETTER_AUTH_SECRET is auto-generated inline)
railway variables \
  --set "BETTER_AUTH_SECRET=$(openssl rand -hex 32)" \
  --set "PAPERCLIP_DEPLOYMENT_MODE=authenticated" \
  --set "PAPERCLIP_DEPLOYMENT_EXPOSURE=public" \
  --set "PAPERCLIP_STORAGE_PROVIDER=local" \
  --set "PAPERCLIP_SECRETS_PROVIDER=env" \
  --set 'DATABASE_URL=${{Postgres.DATABASE_URL}}'

# 5. Deploy (uploads current directory as build context; ~3-5 min)
railway up
```

When step 5 finishes, paste the output back to me. I'll tell you the public URL and verify `/health`.

## Then: attach agentswarm.co.uk

```bash
# Give the service a Railway *.up.railway.app URL to sanity-check first
railway domain

# Once /health returns 200 on the *.up.railway.app URL, add the custom domain
railway domain agentswarm.co.uk
# Railway will print a CNAME target — something like xxx.up.railway.app
```

In **GoDaddy** (DNS → agentswarm.co.uk):

- GoDaddy does not allow CNAME at the apex. You have two choices:
  - **(a) Use a subdomain** like `app.agentswarm.co.uk` — cleaner. Add a CNAME at `app` → Railway CNAME target. Then re-run `railway domain app.agentswarm.co.uk` instead.
  - **(b) Use apex** — in which case Railway will give you an A record (IP) instead of a CNAME. Add an A record at `@` with that IP.

Then update the auth base URL to whichever domain you picked and redeploy:

```bash
railway variables --set "PAPERCLIP_AUTH_PUBLIC_BASE_URL=https://app.agentswarm.co.uk"   # or agentswarm.co.uk
railway up
```

## Done

Paste the final public URL back and I'll run through sign-up + install the Agent Collective template to prove it's working end-to-end.
