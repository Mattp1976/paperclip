FROM node:20-slim

WORKDIR /app

# Install jq for JSON manipulation
RUN apt-get update && apt-get install -y --no-install-recommends jq && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package.json tsconfig.json ./

# Remove workspace dependency and install
RUN jq 'del(.dependencies["@paperclipai/plugin-sdk"])' package.json > package.tmp.json && \
    mv package.tmp.json package.json && \
    npm install

# Copy source
COPY src/ src/

# Expose health check port
ENV PORT=3200
EXPOSE 3200

# Run scheduler with tsx (TypeScript execution)
CMD ["npx", "tsx", "src/scheduler.ts"]
