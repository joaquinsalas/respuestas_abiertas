import json
import logging
import math

from openai import OpenAI
from dotenv import load_dotenv
import pandas as pd
import numpy as np
import os
import polars as pl


load_dotenv()

logger = logging.getLogger('back.embeddings')

client = OpenAI(api_key=os.getenv('api_key_openai'))

# ada-002 hard limit is 8191 tokens; ~4 chars/token → 32 000 chars is safe ceiling
_MAX_CHARS  = 32_000
# OpenAI embeddings API max batch size
_BATCH_SIZE = 500


def _clean_texts(raw: list) -> tuple[list[str], list[int]]:
    """Return (clean_texts, valid_indices) filtering/sanitizing values unsafe for the API."""
    clean, indices = [], []
    for i, val in enumerate(raw):
        # None AND float NaN both indicate missing data
        if val is None:
            continue
        try:
            if isinstance(val, float) and math.isnan(val):
                continue
        except (TypeError, ValueError):
            pass

        # Force to plain Python str — removes any Polars wrapper types
        text = val if isinstance(val, str) else str(val)
        # Remove null bytes and normalize all unicode whitespace with str.strip()
        text = text.replace('\x00', '').strip()
        if not text:
            continue
        # Remove lone Unicode surrogates (\uD800–\uDFFF) — valid in Python str
        # but they make json.dumps() produce invalid JSON, causing OpenAI 400 errors
        try:
            text = text.encode('utf-8', errors='replace').decode('utf-8')
        except Exception:
            continue
        if not text.strip():
            continue
        if len(text) > _MAX_CHARS:
            logger.warning(
                "embeddings: texto índice %d truncado de %d a %d chars", i, len(text), _MAX_CHARS
            )
            text = text[:_MAX_CHARS]
        clean.append(text)
        indices.append(i)
    return clean, indices


def _log_texts_sample(texts: list[str], label: str) -> None:
    non_str = [(i, type(t).__name__, repr(t)[:120]) for i, t in enumerate(texts) if not isinstance(t, str)]
    logger.warning(
        "%s — total=%d, non-str=%d, primeros_3=%s",
        label, len(texts), len(non_str),
        [repr(t[:80]) for t in texts[:3]],
    )
    if non_str:
        logger.error("%s — ELEMENTOS NO-STRING (primeros 5): %s", label, non_str[:5])


def get_embedding_single_text(text, model="text-embedding-ada-002"):
    return client.embeddings.create(input=text, model=model).data[0].embedding


def get_embeddings_batch(texts: list[str], model="text-embedding-ada-002") -> list:
    """Send texts in chunks of _BATCH_SIZE to avoid API limits."""
    _log_texts_sample(texts, "get_embeddings_batch")

    all_embeddings = []
    for start in range(0, len(texts), _BATCH_SIZE):
        chunk = texts[start: start + _BATCH_SIZE]
        # Final type guard: every element must be a plain str
        safe_chunk = [t if isinstance(t, str) else str(t) for t in chunk]
        # Pre-flight: verify JSON serializability to catch any remaining surrogate issues
        try:
            json.dumps(safe_chunk)
        except (ValueError, UnicodeEncodeError):
            logger.warning(
                "get_embeddings_batch: chunk [%d:%d] contiene surrogados — sanitizando",
                start, start + len(safe_chunk),
            )
            safe_chunk = [t.encode('utf-8', errors='replace').decode('utf-8') for t in safe_chunk]
        logger.warning(
            "get_embeddings_batch: enviando chunk [%d:%d] al API",
            start, start + len(safe_chunk),
        )
        response = client.embeddings.create(model=model, input=safe_chunk)
        all_embeddings.extend(item.embedding for item in response.data)

    return all_embeddings


def get_embeddings_main(dataframe_csv: pl.DataFrame, text_column, ID_column=None) -> pl.DataFrame:
    if text_column not in dataframe_csv.columns:
        raise KeyError(f"Columna {text_column} no encontrada")

    logger.info(
        "get_embeddings_main: columna=%s dtype=%s filas=%d",
        text_column,
        dataframe_csv[text_column].dtype,
        len(dataframe_csv),
    )

    raw_texts = dataframe_csv[text_column].cast(pl.Utf8).to_list()
    clean_texts, valid_indices = _clean_texts(raw_texts)

    dropped = len(raw_texts) - len(clean_texts)
    if dropped:
        logger.warning(
            "get_embeddings_main: %d/%d filas descartadas (null/NaN/vacías)",
            dropped, len(raw_texts),
        )

    if not clean_texts:
        raise ValueError("No hay textos válidos para generar embeddings")

    embeddings_list = get_embeddings_batch(clean_texts)

    if ID_column:
        all_ids = dataframe_csv[ID_column].cast(pl.Utf8).to_list()
        id_values = [all_ids[i] for i in valid_indices]
    else:
        id_values = [str(i) for i in valid_indices]

    return pl.DataFrame({
        'embedding': embeddings_list,
        'ID': id_values,
    })
