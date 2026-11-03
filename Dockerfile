# Multi-stage build for the Next.js standalone server.
# WHY pinned digest-less tag with exact patch version: matches the Node the droplet/tests run (CI NODE_VERSION).
# next.config.ts sets output: "standalone", so .next/standalone carries node_modules traced for prod only.
FROM node:20.20.2-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# WHY --ignore-scripts: no dependency needs an install script; a compromised postinstall never runs.
RUN npm ci --ignore-scripts --no-audit --no-fund

FROM node:20.20.2-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
# .dockerignore keeps .git, .env*, docs, e2e and deploy out of the build context, so no secret can enter a layer.
COPY . .
RUN npm run build

FROM node:20.20.2-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    # The server binds 0.0.0.0 INSIDE the container; the deployer publishes 127.0.0.1 only.
    HOSTNAME=0.0.0.0 \
    PORT=3000
RUN groupadd --gid 10001 nextjs && useradd --uid 10001 --gid nextjs --create-home --shell /usr/sbin/nologin nextjs
COPY --from=build --chown=nextjs:nextjs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nextjs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nextjs /app/public ./public
USER nextjs
EXPOSE 3000
# WHY node instead of a curl/wget install: the slim base ships node; no extra package, no extra CVE surface.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "server.js"]
