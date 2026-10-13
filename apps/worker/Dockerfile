# 워커 이미지. 저장소 루트를 빌드 컨텍스트로 사용한다:
#   docker build -f apps/worker/Dockerfile .
FROM node:22-slim
WORKDIR /app
RUN corepack enable

# 의존성 먼저 (캐시 활용)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/worker/package.json apps/worker/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY packages/domain/package.json packages/domain/
RUN pnpm install --frozen-lockfile --filter "@myos/worker..."

COPY packages packages
COPY apps/worker apps/worker

ENV NODE_ENV=production
CMD ["pnpm", "--filter", "@myos/worker", "start"]
