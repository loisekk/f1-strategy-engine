# F1 Strategy Engine — premium frontend (Next.js 16 + Bun)
FROM oven/bun:1 AS builder
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile || bun install

COPY . .
ARG NEXT_PUBLIC_ML_API_URL=http://localhost:8000
ENV NEXT_PUBLIC_ML_API_URL=$NEXT_PUBLIC_ML_API_URL
RUN bun run build

FROM oven/bun:1
WORKDIR /app
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
EXPOSE 3000
CMD ["bun", "server.js"]
