# syntax=docker/dockerfile:1
#
# Zentra backend image.
#
# The SF10 PDF path shells out to LibreOffice (`services/sf10/xlsx-to-pdf.service.ts`),
# so the runtime stage installs `libreoffice-calc` plus metric-compatible fonts:
# Carlito stands in for Calibri and Liberation Sans Narrow for Arial Narrow (the
# template's fonts). Without them the converted form reflows.
#
# The Prisma client is committed under `src/generated/prisma`, so the build does
# not run `prisma generate` — and CI/migrations are applied by hand, not here.

FROM node:22-bookworm-slim AS deps
# argon2 is a native addon; the build tools cover the case where no prebuilt
# binary matches the base image. They stay in this stage only.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
WORKDIR /app
COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
# Compile, then drop dev dependencies so the runtime copies a production tree
# (with the already-compiled native addons) instead of reinstalling.
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    HOME=/tmp \
    SF10_SOFFICE_PATH=/usr/bin/soffice

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates \
      fontconfig \
      fonts-crosextra-carlito \
      fonts-liberation2 \
      libreoffice-calc \
 && fc-cache -f \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# LibreOffice writes its throwaway profile into the temp dir; `-env:UserInstallation`
# in the converter keeps concurrent runs apart, so HOME just has to be writable.
CMD ["node", "dist/index.js"]
