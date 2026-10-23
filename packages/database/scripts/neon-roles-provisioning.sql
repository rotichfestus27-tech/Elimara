-- ============================================================================
-- Elimara School OS — Neon PostgreSQL Least-Privilege Roles Provisioning
-- Target Engine: Neon Serverless Cloud PostgreSQL & PostgreSQL 16+
-- Authoritative Script for Database Administrators / CI Provisioning
-- ============================================================================

-- 1. Create Dedicated Roles if they do not already exist
-- In Neon Production: These roles can be created via Neon Console or using this script.
-- Passwords must be supplied via environment variables or secret management.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'elimara_migrator') THEN
    CREATE ROLE elimara_migrator WITH LOGIN PASSWORD 'elimara_migrator_password';
  END IF;

  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'elimara_app') THEN
    CREATE ROLE elimara_app WITH LOGIN PASSWORD 'elimara_app_password';
  END IF;
END $$;

-- 2. Database Connection Grants
DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO elimara_migrator', current_database());
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO elimara_app', current_database());
END $$;

-- 3. Schema Usage & DDL Authorization Boundaries
-- elimara_migrator: Authorized to create and alter schema objects during deployment
GRANT USAGE, CREATE ON SCHEMA public TO elimara_migrator;

-- elimara_app: Strictly limited to USAGE (no CREATE privilege, blocking all DDL)
GRANT USAGE ON SCHEMA public TO elimara_app;
REVOKE CREATE ON SCHEMA public FROM elimara_app;

-- 4. Existing Tables, Sequences & Routines Access
-- elimara_migrator: Full administrative permissions on tables, sequences, and routines
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO elimara_migrator;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO elimara_migrator;
GRANT ALL PRIVILEGES ON ALL ROUTINES IN SCHEMA public TO elimara_migrator;

-- elimara_app: Strictly limited to DML operations required by the API runtime
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO elimara_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO elimara_app;
GRANT EXECUTE ON ALL ROUTINES IN SCHEMA public TO elimara_app;

-- Prohibit elimara_app from reading or altering Prisma migration metadata
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = '_prisma_migrations') THEN
    REVOKE ALL ON TABLE public._prisma_migrations FROM elimara_app;
  END IF;
END $$;

-- 5. Default Privileges for Objects Created by elimara_migrator in Future Migrations
-- Automatically grants DML access to elimara_app for newly migrated tables and sequences
ALTER DEFAULT PRIVILEGES FOR ROLE elimara_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO elimara_app;

ALTER DEFAULT PRIVILEGES FOR ROLE elimara_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO elimara_app;

ALTER DEFAULT PRIVILEGES FOR ROLE elimara_migrator IN SCHEMA public
  GRANT EXECUTE ON ROUTINES TO elimara_app;

-- 6. Default Privileges for Objects Created by neondb_owner (Neon Cloud Root Role)
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'neondb_owner') THEN
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO elimara_app';
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO elimara_app';
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public GRANT EXECUTE ON ROUTINES TO elimara_app';
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public GRANT ALL PRIVILEGES ON TABLES TO elimara_migrator';
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public GRANT ALL PRIVILEGES ON SEQUENCES TO elimara_migrator';
  END IF;
END $$;
