# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A document analysis and categorization system that uses OpenAI embeddings to find semantic similarity between open-ended text responses, visualized as an interactive graph. Users upload CSVs, generate embeddings, explore similar responses, and group them into categories (graph nodes).

## Tech Stack

- **Frontend:** React 19 + TypeScript + Vite, using `@xyflow/react` for graph visualization
- **Backend:** Django 5.2 (Python 3.14), serving a REST API
- **Database:** PostgreSQL (`analisis` DB)
- **Object Storage:** MinIO (S3-compatible) at `http://localhost:9000`, bucket `user-graphs`
- **ML:** OpenAI `text-embedding-ada-002` for embeddings (API calls incur costs)

## Running the Project

### Backend
```bash
cd resAb
conda activate resAb   # or source activate resAb
python manage.py runserver
```

### Frontend
```bash
cd fronResAb
npm run dev
```
The Vite dev server proxies API requests to the Django backend at `http://localhost:8000`.

### Required Services
- PostgreSQL on `localhost:5432` (DB: `analisis`, user: `postgres`)
- MinIO on `localhost:9000` (credentials in `.env`)
- OpenAI API key in `.env` as `api_key_openai`

### Conda Environment Setup
```bash
conda env create -f environment.yml
conda activate resAb
pip install -r requirements.txt
cd resAb && python manage.py migrate
```

## Frontend Commands
```bash
npm run dev      # Dev server with HMR
npm run build    # TypeScript check + Vite production build
npm run lint     # ESLint
npm run preview  # Preview production build
```

## Architecture

### Data Flow
1. User uploads CSV → backend generates OpenAI embeddings → stored as Parquet on MinIO
2. User searches for similar texts → cosine similarity computed server-side → results shown in graph
3. User selects responses → confirms a category → a new graph node is created
4. Graph structure (nodes/edges) persisted in PostgreSQL

### Backend Structure (`resAb/`)
- `back/views.py` — All business logic (642 lines); no separate serializers layer
- `back/models.py` — 5 models: `users`, `graphs`, `nodes`, `relationship`, `edge`
- `back/embeddings.py` — OpenAI embedding helpers (`get_embedding_single_text`, `get_embeddings_batch`, `get_embeddings_main`)
- `resAb/urls.py` — 15 registered URL patterns
- `resAb/settings.py` — PostgreSQL config, CORS allowed for all origins

### S3 Path Convention
```
user-graphs/{user_id}/{graph_id}/
  data.parquet          # Original CSV data
  embedding.parquet     # Generated embeddings
  currentReview.parquet # Items currently under review
  temp_emb.parquet      # Temporary embeddings during search
  {category_name}.parquet  # Per-category data
```

### Frontend Structure (`fronResAb/src/`)
- `App.tsx` — Page router; page 1 = ListGraphs, page 2 = Analyzer. Hardcoded `user_id=1`.
- `listGraphs/` — Graph list, CSV upload, column selection
- `analyzer/` — Main XYFlow graph canvas, similarity search, context menus, category confirmation
- `routes.ts` — All API endpoint URLs (base: `http://localhost:8000`)

### Database Relations
```
users (1) → graphs (M) → nodes (M)
                       → edges (connecting nodes, unique on from_node+to_node+relation)
users (1) → relationships (edge type definitions)
```

## Key Implementation Details

- **Similarity:** Cosine similarity via `dot_product / (||a|| * ||b||)`, default threshold 0.8
- **No authentication:** Development mode only — CORS open, `user_id=1` hardcoded in frontend
- **No tests:** `back/tests.py` is empty; no frontend test framework configured
- **Legacy code:** `code/` and `marco_aproximaciones/` directories are older experiments, not active
- **Embeddings cost:** Every new analysis or similarity search that calls OpenAI costs money
