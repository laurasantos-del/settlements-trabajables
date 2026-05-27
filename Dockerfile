FROM python:3.12-slim

# Install Chromium + driver (needed for Selenium scraper)
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    chromium-driver \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY server.py debtmanager_scraper.py ./

ENV HEADLESS=true \
    CHROME_BIN=/usr/bin/chromium \
    CHROMEDRIVER_BIN=/usr/bin/chromedriver \
    PYTHONUNBUFFERED=1 \
    SCRAPER_AUTO_RUN=true \
    SCRAPER_INTERVAL_HOURS=6

EXPOSE 8000

CMD uvicorn server:app --host 0.0.0.0 --port ${PORT:-8000} \
    --ws-ping-interval 600 --ws-ping-timeout 600
