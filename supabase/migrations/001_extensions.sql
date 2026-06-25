-- 001_extensions.sql
-- Enable required PostgreSQL extensions for the AI Attendance System

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS citext;
