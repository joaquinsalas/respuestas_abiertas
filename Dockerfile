# ── Stage 1: Build frontend ───────────────────────────────────────────────────
FROM node:20-alpine AS frontend-builder

WORKDIR /frontend
COPY resAb/frontResAb/package*.json ./
RUN npm ci
COPY resAb/frontResAb/ ./
RUN npm run build

# ── Stage 2: Python runtime ───────────────────────────────────────────────────
FROM python:3.13-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
        gcc \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Python deps (capa cacheada)
COPY resAb/requirements.prod.txt .
RUN pip install --no-cache-dir -r requirements.prod.txt

# Código fuente del backend
COPY resAb/ .

# Frontend compilado
COPY --from=frontend-builder /frontend/dist ./frontResAb/dist

# Archivos estáticos
RUN DJANGO_SECRET_KEY=build-dummy \
    DATABASE_NAME=dummy DATABASE_USER=dummy DATABASE_PASSWORD=dummy \
    DATABASE_HOST=dummy DATABASE_PORT=5432 \
    python manage.py collectstatic --noinput

EXPOSE 8000

# Railway inyecta $PORT; gunicorn lo respeta. Timeout extendido para llamadas OpenAI.
CMD sh -c "python manage.py migrate --noinput && \
           gunicorn --bind 0.0.0.0:${PORT:-8000} \
                    --workers 2 \
                    --timeout 300 \
                    resAb.wsgi"
