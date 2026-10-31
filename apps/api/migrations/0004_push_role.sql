-- The push worker can see who to notify and mark it done, and nothing else: no workouts, no
-- passwords, no posts. Only where the role exists, because it's made by deploy/db-init.sh.
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'sandbag_push') THEN
    GRANT SELECT, UPDATE (pushed_at) ON notifications TO sandbag_push;
    GRANT SELECT, DELETE ON push_tokens TO sandbag_push;
    GRANT SELECT (token_hash, expires_at) ON auth_sessions TO sandbag_push;
  END IF;
END $$;
