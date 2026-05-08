# Ecommerce Microservices

A Docker-based ecommerce backend with a small browser UI for testing the main flows locally.

This started as a microservices practice project, but I kept it runnable as a real local demo: Nginx serves the UI, the API gateway routes requests, and each domain service owns its own database or infrastructure dependency.

## What Is Included

- Static ecommerce ops UI served from Nginx
- API Gateway with JWT authentication and Redis-backed rate limiting
- User service for registration, login, sessions, and profiles
- Product service for catalog, search, filters, stock, and product creation
- Order service with Kafka event handling for payment updates
- Payment service with Stripe-style payment intent routes
- Notification service listening to Kafka events
- PostgreSQL databases per service
- Redis for sessions, cache, blacklist, and rate limits
- Kafka and Zookeeper for service events
- Kafka UI and Redis Commander for local inspection

## Tech Stack

- Node.js
- Express
- PostgreSQL
- Sequelize
- Redis
- Kafka
- Docker Compose
- Nginx
- HTML, CSS, and vanilla JavaScript for the local UI

## Local Setup

You only need Docker Desktop for the full stack.

```powershell
docker compose up --build -d
```

Once the containers are healthy, open:

- App UI: http://localhost
- API health: http://localhost/health
- API gateway health: http://localhost:3000/health
- Kafka UI: http://localhost:8090
- Redis Commander: http://localhost:8091

To check the services:

```powershell
docker compose ps
```

To follow gateway logs:

```powershell
docker compose logs -f api-gateway
```

To stop everything:

```powershell
docker compose down
```

## Quick Demo Flow

1. Open http://localhost.
2. Register a test account from the left panel.
3. Add a product from the create product form.
4. Confirm the product appears in the catalog.
5. Use Kafka UI or Redis Commander if you want to inspect the supporting services.

The UI is intentionally simple. It is there to prove the backend is alive without needing Postman for every request.

## Main API Routes

Authentication:

```http
POST /api/v1/auth/register
POST /api/v1/auth/login
POST /api/v1/auth/logout
POST /api/v1/auth/refresh
```

Products:

```http
GET    /api/v1/products
GET    /api/v1/products/categories
GET    /api/v1/products/:id
POST   /api/v1/products
PUT    /api/v1/products/:id
PATCH  /api/v1/products/:id/stock
DELETE /api/v1/products/:id
```

Orders:

```http
POST   /api/v1/orders
GET    /api/v1/orders
GET    /api/v1/orders/stats
GET    /api/v1/orders/:id
PATCH  /api/v1/orders/:id/status
DELETE /api/v1/orders/:id
```

Payments:

```http
GET  /api/v1/payments
POST /api/v1/payments/intent
POST /api/v1/payments/confirm
POST /api/v1/payments/refund
POST /api/v1/payments/webhook
```

## Project Structure

```text
ecommerce-microservices/
  api-gateway/
  frontend/
  nginx/
  services/
    user-service/
    product-service/
    order-service/
    payment-service/
    notification-service/
  scripts/
  docs/
  docker-compose.yml
```

## Environment Variables

The compose file includes development defaults so the project runs locally without extra setup.

For anything beyond a local demo, replace the defaults with real secrets:

```env
POSTGRES_USER=postgres
POSTGRES_PASSWORD=change_me
REDIS_PASSWORD=change_me
JWT_SECRET=change_me
STRIPE_SECRET_KEY=sk_test_change_me
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=change_me
SMTP_PASS=change_me
```

Do not commit a real `.env` file.

## Notes

This is a learning/demo project, not a production deployment template. Before using it anywhere public, I would still add:

- real secret management
- stronger API authorization around admin product routes
- service-level tests for product, order, and payment flows
- package lock files for every service
- proper CI checks
- TLS and production Nginx settings
- managed Postgres, Redis, and Kafka instead of local containers

## Recent Fixes

- Fixed the Docker Compose `payment-service` block so the stack can start.
- Fixed API Gateway POST proxying so JSON bodies reach downstream services.
- Fixed Redis rate limiter hit counting.
- Fixed product slug generation so product creation works from the UI.
