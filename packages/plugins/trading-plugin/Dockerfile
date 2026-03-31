FROM node:20-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends jq postgresql-client && rm -rf /var/lib/apt/lists/*

COPY package.json tsconfig.json ./

RUN jq 'del(.dependencies["@paperclipai/plugin-sdk"])' package.json > package.tmp.json && \
    mv package.tmp.json package.json && \
    npm install

COPY src/ src/
COPY public/ public/

RUN printf '#!/bin/sh\necho "Running database migrations..."\npsql "$DATABASE_URL" -f /app/src/db/migrate.sql 2>&1 || echo "Migration warning (may be OK if tables exist)"\necho "Starting scheduler..."\nexec npx tsx src/scheduler.ts\n' > /app/entrypoint.sh && chmod +x /app/entrypoint.sh

ENV PORT=3200
EXPOSE 3200

CMD ["/app/entrypoint.sh"]
