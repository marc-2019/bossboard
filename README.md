# BossBoard

Mobile-first compliance and invoicing platform for New Zealand tradies and small service businesses.

## Overview

BossBoard helps plumbers, electricians, builders, and landscapers with:
- **Compliance Documentation**: AI-assisted SWMS and risk assessment templates aligned with HSWA 2015 — templates and starting material, not legal advice. While the operator stays accountable, BossBoard takes the blank-page problem off the table.
- **Invoicing & Revenue Tracking**: Quotes, invoices, GST, basic revenue dashboard
- **Cashflow Forecasting (Coming Q2 2026)**: Xero integration, invoice chasing, full cashflow position
- **Visa/Hiring Compliance (Coming Q3-Q4 2026)**: Employee visa tracking, certification management

## Quick Start

### Prerequisites
- Docker & Docker Compose
- Node.js 20+ (for local development)
- Expo CLI (for mobile development)

### Docker Setup (Recommended)

```bash
# Clone repository
git clone https://github.com/instilligent/bossboard.git
cd bossboard

# Start all services
docker-compose up -d

# Verify services are running
docker-compose ps

# Check API health
curl http://localhost:29000/health
```

### Services

| Service | Port | Description |
|---------|------|-------------|
| bossboard-api | 29000 | Express API server |
| bossboard-postgres | 29432 | PostgreSQL database |
| bossboard-redis | 29379 | Redis cache |

### API Endpoints

**Health & Status**
- `GET /health` - Health check with dependency status
- `GET /health/ready` - Readiness probe
- `GET /health/live` - Liveness probe

**Authentication** (`/api/v1/auth`)
- `POST /register` - Register new user
- `POST /login` - Login user
- `POST /refresh` - Refresh access token
- `POST /logout` - Logout (requires auth)
- `GET /me` - Get current user (requires auth)
- `PUT /me` - Update profile (requires auth)

**SWMS Documents** (`/api/v1/swms`)
- `GET /templates` - List available templates
- `GET /templates/:tradeType` - Get specific template
- `POST /generate` - Generate new SWMS (requires auth)
- `GET /` - List user's documents (requires auth)
- `GET /:id` - Get specific document (requires auth)
- `PUT /:id` - Update document (requires auth)
- `DELETE /:id` - Delete document (requires auth)
- `POST /:id/sign` - Sign document (requires auth)

### Local Development

```bash
# Install dependencies
cd apps/api && npm install

# Run tests
npm test

# Start in development mode (with Docker services running)
npm run dev
```

## Project Structure

```
├── apps/
│   ├── api/              # Express backend
│   │   ├── src/
│   │   │   ├── config/   # Configuration
│   │   │   ├── middleware/   # Express middleware
│   │   │   ├── routes/   # API routes
│   │   │   ├── services/ # Business logic
│   │   │   ├── templates/# SWMS templates (JSON)
│   │   │   ├── types/    # TypeScript types
│   │   │   └── __tests__/ # Test files
│   │   ├── Dockerfile.api
│   │   └── jest.config.js
│   └── mobile/           # React Native app (Expo)
├── packages/
│   └── shared/           # Shared types
├── database/
│   └── init.sql          # Database schema
├── docs/                 # Documentation
├── docker-compose.yml    # Service orchestration
└── CLAUDE.md             # Project brain
```

## Documentation

- [Project Brain (CLAUDE.md)](./CLAUDE.md) - Full project context
- [Port Assignments](./PORTS.md) - Service ports
- [Changelog](./docs/CHANGELOG.md) - Version history

## Testing

```bash
# Run all tests
docker-compose exec bossboard-api npm test

# Run with coverage
docker-compose exec bossboard-api npm run test:coverage

# Watch mode (local development)
cd apps/api && npm run test:watch
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | API port | 29000 |
| `DATABASE_URL` | PostgreSQL connection string | (docker-compose provides) |
| `REDIS_URL` | Redis connection string | (docker-compose provides) |
| `JWT_SECRET` | JWT signing secret | (required) |
| `JWT_REFRESH_SECRET` | Refresh token secret | (required) |
| `ANTHROPIC_API_KEY` | Claude API for AI features | (optional) |

## Contributing

1. Create feature branch from `main`
2. Follow conventional commits (`feat:`, `fix:`, `docs:`)
3. Run tests before PR: `npm test`
4. Request review

## License

Proprietary - Instilligent Limited
