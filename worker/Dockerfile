FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY worker/requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy worker application source files into /app/worker/
COPY worker/ /app/worker/

# Ensure module package directories resolve successfully from root execution context
RUN touch /app/worker/__init__.py /app/worker/modules/__init__.py

ENV PYTHONPATH=/app

CMD ["python", "worker/main.py"]