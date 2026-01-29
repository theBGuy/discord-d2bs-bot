# syntax=docker/dockerfile:1

ARG NODE_VERSION=22

# Build stage
FROM node:${NODE_VERSION}-alpine AS build

# Enable corepack for pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /usr/src/app

# Install all dependencies (including devDependencies for build)
RUN --mount=type=bind,source=package.json,target=package.json \
    --mount=type=bind,source=pnpm-lock.yaml,target=pnpm-lock.yaml \
    --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# Copy source files and build
COPY . .
RUN pnpm run build

# Production stage
FROM node:${NODE_VERSION}-alpine

ENV NODE_ENV=production

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /usr/src/app

# Install only production dependencies
RUN --mount=type=bind,source=package.json,target=package.json \
    --mount=type=bind,source=pnpm-lock.yaml,target=pnpm-lock.yaml \
    --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --prod

# Copy built files from build stage
COPY --from=build /usr/src/app/dist ./dist
COPY package.json .

# Run the application as a non-root user.
USER node

# Expose the port that the application listens on.
EXPOSE 12345

# Run the application.
CMD ["pnpm", "start"]
