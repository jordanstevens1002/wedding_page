# Editor access

There is one shared editor account, no default password and no public registration.
The browser login interface follows in issue #4; this slice supplies its backend.

## Configure or recover the account

Start Compose as described in the README, then use an interactive terminal:

```sh
docker compose exec app python manage.py editor_account bootstrap
docker compose exec app python manage.py editor_account recover
```

Bootstrap optionally accepts `--username`; its default is `editor`. Bootstrap refuses
to replace an existing account. Recovery keeps the existing username, sets a new
password, reactivates the editor and resets the login cooldown. Both commands prompt
privately for a password and confirmation; passwords require at least 12 characters
and must pass Django's similarity, common-password and numeric-password checks.

For automation, explicitly add `--password-stdin` and provide one password line via
private stdin with `docker compose exec -T`. Never put passwords in command arguments,
committed files, shell history or shared logs. The command does not print passwords.
Recovery invalidates every existing editor session on its next authenticated request.

## HTTPS and proxy configuration

Secure cookies are enabled by default. Authentication requires HTTPS; health checks
remain accessible over the internal HTTP connection. Behind your existing HTTPS
proxy, set `DJANGO_TRUST_PROXY_HEADERS=true` only when that proxy strips
client-supplied `X-Forwarded-Proto` and sets it from the actual connection scheme.
Keep the Compose gateway bound to localhost or an equivalently isolated private
network. The gateway preserves Host including its port and forwards the protocol
header; Django ignores that protocol header unless explicitly configured to trust it.

For isolated loopback development only, set `DJANGO_SECURE_COOKIES=false` and recreate
the app service. Do not use this setting on a publicly reachable deployment. Invalid
boolean configuration values fail startup. Cross-origin login is not enabled.

## Session and login behaviour

Sessions are stored in PostgreSQL. Cookies are HttpOnly and SameSite=Lax. CSRF is
required for login even before authentication and for all authenticated mutations.
Authentication rotates session and CSRF tokens; auth responses are not cached.
Sessions expire after 30 minutes idle or 12 hours absolute, regardless of activity.

The shared editor login has one PostgreSQL-backed attempt bucket across every worker:
five failed attempts in a 15-minute window block further attempts until that window
ends. A blocked response is 429 with Retry-After. Successful login clears the counter;
operator recovery also clears it. Because it is global, attempts from another address
cannot bypass the limit, but can temporarily prevent the editor from signing in.
No IP addresses are stored for throttling. Invalid credentials use a generic response.

Changing the password requires the current password. The current session is retained;
other sessions become invalid. A Django staff/superuser account does not gain editor
access unless it is the configured shared editor.

| Endpoint | Method | Behaviour |
| --- | --- | --- |
| `/api/editor/csrf/` | GET | Set the CSRF cookie and return a masked csrf_token. |
| `/api/editor/login/` | POST | Accept username/password with the CSRF header; return username and a rotated csrf_token. |
| `/api/editor/session/` | GET | Return the authenticated editor username and csrf_token. |
| `/api/editor/logout/` | POST | Require CSRF and invalidate the current session. |
| `/api/editor/password/` | POST | Accept current_password/new_password with CSRF; return username and csrf_token. |

Use `X-CSRFToken` for mutations; clients obtain it from the JSON response rather than
reading the HttpOnly CSRF cookie. Expired or unauthorised editor access returns 403.
CSRF failures may use Django's HTML error response; clients should handle the status
without assuming every error body is JSON.
