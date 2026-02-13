# Changelog

## [1.1.13] - 2026-02-12

### Added
- **Atomic Claim Endpoint** (`POST /api/cards/:id/claim`): First-claim-wins with `BEGIN IMMEDIATE` transaction and `FOR UPDATE` locking
- **Atomic Transition Endpoint** (`POST /api/cards/:id/transition`): Status transitions now use transactions for safety
- **Health Check Endpoint** (`GET /health`): Returns status, timestamp, and uptime
- **Phase 1 Test Script** (`test-api.js`): Validates all API endpoints and workflow rules

### Changed
- Upgraded claim logic to use SQLite transactions (`BEGIN IMMEDIATE`) for true atomicity
- Improved `/api/cards` endpoints to use proper transaction semantics
- `POST /api/tasks/:id/claim` remains available but lacks atomic guarantees

### Fixed
- Workflow rules now enforced server-side with proper role checks
- Only Founder can transition Review → Done (returns 403 with clear error)
- Invalid transitions return 409/403 with descriptive error messages

### Security
- Atomic operations prevent race conditions during task claiming
- Role-based access control enforced on all status transitions

### Stability (Render Ready)
- Database path configurable via `DB_PATH` env var
- No `process.exit` crashes on optional features
- Health endpoint for load balancer health checks

## [1.1.12] - Previous
- Initial Phase 1 infrastructure baseline
- Basic API endpoints (`/api/cards`, `/api/cards/:id/comment`)
- SQLite persistence with activity logging
