#!/bin/sh
set -e

echo "Applying database migrations..."
python manage.py migrate --noinput

echo "Starting backend on port 29519..."
exec gunicorn config.wsgi:application --bind 0.0.0.0:29519
