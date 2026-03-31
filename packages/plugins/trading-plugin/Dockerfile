FROM node:20-slim

WORKDIR /app

# Install jq for JSON manipulation and postgresql-client for migrations
RUN apt-get update && apt-get install -y --no-install-recommends jq postgresql-client && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package.json tsconfig.json ./

# Remove workspace dependency and install
RUN jq 'del(.dependencies["@paperclipai/plugin-sdk"])' package.json > package.tmp.json && \
    mv package.tmp.json package.json && \
    npm install

# Copy source (includes migrate.sql)
COPY src/ src/

# Create entrypoint that runs migrations then starts scheduler
RUN printf '#!/bin/sh\necho "Running database migrations..."\npsql "$DATABASE_URL" -f /app/src/db/migrate.sql 2>&1 || echo "Migration warning (may be OK if tables exist)"\necho "Starting scheduler..."\nexec npx tsx src/scheduler.ts\n' > /app/entrypoint.sh && chmod +x /app/entrypoint.sh

# Expose health check port
ENV PORT=3200
EXPOSE 3200

CMD ["/app/entrypoint.sh"]
