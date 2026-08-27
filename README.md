# CollabForge API

Backend API for **CollabForge**, a real-time collaborative board application: boards, sticky notes, voting, and action items, with live sync over WebSockets.

Built with [NestJS](https://nestjs.com/) and PostgreSQL.

## Tech stack

- **Framework:** NestJS 11 (Express platform)
- **Database:** PostgreSQL + TypeORM
- **Real-time:** Socket.IO (`@nestjs/websockets`)
- **Auth:** JWT (access/refresh) with Passport, password hashing with Argon2
- **Validation:** class-validator / class-transformer, Zod
- **Logging:** Pino (`nestjs-pino`)
- **Metrics:** Prometheus (`prom-client`)
- **Security:** Helmet, rate limiting (`@nestjs/throttler`), CORS with credentials
- **Package manager:** pnpm

## Project structure

```
src/
  action-items/   # action items tied to a board/session
  auth/            # login, refresh, JWT strategies
  boards/          # boards CRUD
  common/          # shared guards, decorators, pipes, filters
  config/          # environment/config schema
  contracts/       # shared request/response types
  database/        # TypeORM data source, migrations
  health/          # health check endpoint
  notes/           # sticky notes
  observability/   # correlation id, logging middleware
  realtime/        # WebSocket gateways
  session/         # collaborative session state
  users/           # user accounts
  votes/           # voting on notes
```

## Requirements

- Node.js (LTS)
- pnpm
- PostgreSQL 16 (a local instance is provided via Docker)

## Setup

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Copy the environment template and adjust values:

   ```bash
   cp .env.example .env
   ```

3. Start PostgreSQL locally:

   ```bash
   docker compose -f docker/docker-compose.dev.yml up -d
   ```

4. Run pending migrations:

   ```bash
   pnpm migration:run
   ```

## Running the app

```bash
# development (watch mode)
pnpm start:dev

# production
pnpm build
pnpm start:prod
```

The API is served under the `/api` prefix; `/health` and `/metrics` are exposed without the prefix.

## Testing

```bash
# unit tests
pnpm test

# e2e tests
pnpm test:e2e

# coverage
pnpm test:cov
```

## Migrations

```bash
pnpm migration:generate   # generate a new migration from entity changes
pnpm migration:run        # apply pending migrations
pnpm migration:revert     # revert the last migration
```

## License

This project is **proprietary and unlicensed for public use** (`UNLICENSED`, see `package.json`) — all rights reserved, no license is granted to use, copy, or distribute this code.

It is built on top of [NestJS](https://github.com/nestjs/nest), which is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE). Third-party dependencies retain their own licenses as declared in `package.json`.
