FROM python:3.13-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    nodejs npm \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Python deps (capa cacheada mientras requirements.txt no cambie)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# npm deps (capa cacheada mientras package.json no cambie)
COPY frontResAb/package*.json frontResAb/
RUN npm --prefix frontResAb ci

# Código fuente completo
COPY . .

# Build del frontend (genera frontResAb/dist/)
RUN npm --prefix frontResAb run build

# Archivos estáticos
RUN DJANGO_SECRET_KEY=build-dummy python manage.py collectstatic --noinput

EXPOSE 8000
CMD ["sh", "-c", "python manage.py migrate --noinput && gunicorn --bind 0.0.0.0:8000 --workers 3 resAb.wsgi"]
