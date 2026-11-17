FROM python:3.13-slim-bookworm@sha256:a5a7017efc5969e00ae2b91c8eb0631049a569652aa4ffc4501769049ae45c72 AS base
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.lock ./
RUN pip install --no-cache-dir --require-hashes -r requirements.lock
COPY manage.py ./
COPY wedding ./wedding
RUN useradd --uid 10001 --create-home app && mkdir -p /data/media && chown app:app /data/media
USER app
CMD ["gunicorn", "wedding.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "2", "--access-logfile", "-"]

FROM base AS test
USER root
COPY dev/requirements.lock /tmp/test-requirements.lock
RUN pip install --no-cache-dir --require-hashes -r /tmp/test-requirements.lock
COPY pyproject.toml ./
COPY tests ./tests
USER app
CMD ["pytest", "-q"]

FROM base AS runtime
