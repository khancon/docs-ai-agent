FROM python:3.12-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY requirements.lock .
RUN pip install --no-cache-dir -r requirements.lock && useradd --create-home kubeguide
COPY --chown=kubeguide:kubeguide app ./app
COPY --chown=kubeguide:kubeguide data/corpus.json data/manifest.json data/embeddings.npy ./data/
COPY --chown=kubeguide:kubeguide main.py .
USER kubeguide
EXPOSE 8000
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} --no-proxy-headers"]
