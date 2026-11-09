# Source this to point everything at the local, isolated stack:  source tests/e2e/stack/env.sh
# Nothing here is a real credential. The keys are signed with a throwaway secret that only the local Auth container knows.
export DATABASE_URL=postgresql://postgres:postgres@localhost:54330/postgres
export DIRECT_URL=postgresql://postgres:postgres@localhost:54330/postgres
export SUPABASE_URL=http://localhost:54321
export NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
export SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlLWxvY2FsIiwiaWF0IjoxNzAwMDAwMDAwLCJleHAiOjQxMDI0NDQ4MDB9.5ObqxUNaKw8DvDOyKRwJVkAUJr9FiNvoCmfa2IcgmbI
export NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlLWxvY2FsIiwiaWF0IjoxNzAwMDAwMDAwLCJleHAiOjQxMDI0NDQ4MDB9.5ObqxUNaKw8DvDOyKRwJVkAUJr9FiNvoCmfa2IcgmbI
export SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UtbG9jYWwiLCJpYXQiOjE3MDAwMDAwMDAsImV4cCI6NDEwMjQ0NDgwMH0.4e1MHt1ZzMpeSL8daBoY96z4dvIKCevK1NO8MhH-2R4
export SMTP_HOST=localhost SMTP_PORT=54326 SMTP_USER=test SMTP_PASS=test SMTP_FROM=noreply@test.local SMTP_DRY_RUN=false
export APP_URL=http://localhost:3111 CORS_ORIGINS=http://localhost:5173,http://localhost:3111
export CRON_SECRET=local-test-only-cron-secret-0123456789
export SEED_COLLEGE_NAME="E2E College" SEED_ADMIN_EMAIL=admin@e2e.test SEED_ADMIN_NAME="E2E Admin" SEED_ADMIN_PASSWORD="E2e-admin-pass-1!"
export GROQ_API_KEY= ANTHROPIC_API_KEY=
export MAIL_SINK=http://localhost:54325
export DB_POOL_MAX=10 FLOOD_MAX_PER_MINUTE=600 GROQ_MODEL=none
