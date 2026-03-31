FROM node:20-slim

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

# Copy package files
COPY package.json pnpm-lock.yaml* ./
COPY tsconfig.json ./

# Install dependencies (without workspace link since standalone)
RUN sed -i 's/"@paperclipai\/plugin-sdk": "workspace:\*"//' package.json && \
    pnpm install --no-frozen-lockfile 2>/dev/null || npm install

# Copy source
COPY src/ src/

# Expose health check port
ENV PORT=3200
EXPOSE 3200

# Run scheduler with tsx (TypeScript execution)
CMD ["npx", "tsx", "src/scheduler.ts"]
