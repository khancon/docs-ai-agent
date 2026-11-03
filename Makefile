.PHONY: install corpus embeddings evaluate test web api
install:
	python3 -m pip install -r requirements-dev.txt
	cd frontend && corepack pnpm install --frozen-lockfile
corpus:
	python3 scripts/build_corpus.py --refresh
embeddings:
	python3 scripts/build_embeddings.py
evaluate:
	python3 scripts/evaluate.py --semantic
	python3 scripts/sync_frontend.py
test:
	python3 -m pytest -q
	cd frontend && corepack pnpm typecheck
web:
	python3 scripts/sync_frontend.py
	cd frontend && corepack pnpm dev
api:
	uvicorn main:app --host 127.0.0.1 --port 8000
