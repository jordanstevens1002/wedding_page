#!/bin/sh
# Disposable, fictional stack. Never run checks against an operator's real volumes.
set -eu
cd "$(dirname "$0")/.."
project="wedding-check-$(date +%s)-$$"
export DJANGO_SECRET_KEY=fictional-check-key-not-for-deployment
export POSTGRES_PASSWORD=fictional-check-password
export POSTGRES_DB=wedding POSTGRES_USER=wedding
export DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1,app,testserver,web
export APP_BIND=127.0.0.1 APP_PORT=0 WEDDING_TIMEZONE=Australia/Sydney
export DJANGO_SECURE_COOKIES=true DJANGO_TRUST_PROXY_HEADERS=false
dc() { docker compose --env-file /dev/null -f compose.yml -p "$project" "$@"; }
cleanup() {
  result=$?
  trap - EXIT
  if [ "$result" -ne 0 ]; then dc logs --tail 30; fi
  dc down --volumes --remove-orphans
  exit "$result"
}
trap cleanup EXIT
dc config --quiet
dc up --build --detach --wait --wait-timeout 120
dc exec -T app python manage.py check
dc exec -T app python manage.py makemigrations --check --dry-run
docker build --target test -t "$project-backend-test" backend
docker run --rm --network "${project}_default" \
  -e DJANGO_SECRET_KEY -e POSTGRES_PASSWORD -e POSTGRES_DB -e POSTGRES_USER \
  -e DJANGO_ALLOWED_HOSTS "$project-backend-test"
dc exec -T app python manage.py spectacular --format openapi-json --validate --fail-on-warn > backend/openapi.json
npm --prefix frontend ci
npm --prefix frontend run api:generate
npm --prefix frontend test
npm --prefix frontend run build
# Check the gateway and distinguish unknown API routes from SPA fallback.
dc exec -T web wget -qO- http://127.0.0.1:8080/ | grep -q 'Wedding details'
dc exec -T web wget -qO- http://127.0.0.1:8080/api/health/ready/ | grep -q '"ok"'
if dc exec -T web wget -qO- http://127.0.0.1:8080/api/unknown/; then
  echo 'Unknown API route unexpectedly returned success' >&2
  exit 1
fi
# Prove that database records and private media outlive all application containers.
dc exec -T app python -c 'from pathlib import Path; Path("/data/media/check.txt").write_text("fictional media")'
dc exec -T app python manage.py shell -c 'from django.contrib.sessions.models import Session; from django.utils import timezone; Session.objects.create(session_key="fictional-persistence-check", session_data="fictional", expire_date=timezone.now())'
dc down
dc up --detach --wait --wait-timeout 120
dc exec -T app python -c 'from pathlib import Path; assert Path("/data/media/check.txt").read_text() == "fictional media"'
dc exec -T app python manage.py shell -c 'from django.contrib.sessions.models import Session; assert Session.objects.filter(session_key="fictional-persistence-check").exists()'
echo 'Application checks and container recreation passed.'
# Exercise the browser against the isolated stack in explicit HTTP development mode.
export DJANGO_SECURE_COOKIES=false
dc down
dc up --detach --wait --wait-timeout 120
printf '%s\n' 'Fictional!Browser!Pass123' | dc exec -T app python manage.py editor_account bootstrap --password-stdin
docker build --target browser-test -t "$project-browser-test" frontend
docker run --rm --shm-size=256m --network "${project}_default" \
  -e BASE_URL=http://web:8080 "$project-browser-test"
