-- User Service Database Initialization
-- This runs when PostgreSQL container starts for the first time

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- For full-text search

-- Users table (Sequelize will create/sync this, but we set up indexes)
-- Indexes created after Sequelize sync
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users("isActive");
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users("createdAt");
