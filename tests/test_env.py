from __future__ import annotations

from pathlib import Path

import pytest

from disease_detect.env import ensure_google_genai_api_key, GOOGLE_GENAI_ENV_VAR, GOOGLE_API_ENV_VAR


def test_existing_google_genai_key_is_preserved():
    env = {GOOGLE_GENAI_ENV_VAR: "topsecret"}

    value = ensure_google_genai_api_key(env=env)

    assert value == "topsecret"
    assert env[GOOGLE_GENAI_ENV_VAR] == "topsecret"
    assert GOOGLE_API_ENV_VAR not in env


def test_legacy_google_api_key_is_upgraded():
    env = {GOOGLE_API_ENV_VAR: "legacy"}

    value = ensure_google_genai_api_key(env=env)

    assert value == "legacy"
    assert env[GOOGLE_GENAI_ENV_VAR] == "legacy"


def test_key_is_loaded_from_dotenv(tmp_path: Path):
    env: dict[str, str] = {}
    dotenv = tmp_path / ".env"
    dotenv.write_text("GOOGLE_GENAI_API_KEY=from_dotenv\n")

    value = ensure_google_genai_api_key(env=env, search_paths=[dotenv])

    assert value == "from_dotenv"
    assert env[GOOGLE_GENAI_ENV_VAR] == "from_dotenv"


def test_legacy_key_is_loaded_from_dotenv(tmp_path: Path):
    env: dict[str, str] = {}
    dotenv = tmp_path / ".env"
    dotenv.write_text("GOOGLE_API_KEY=legacy_from_dotenv\n")

    value = ensure_google_genai_api_key(env=env, search_paths=[dotenv])

    assert value == "legacy_from_dotenv"
    assert env[GOOGLE_GENAI_ENV_VAR] == "legacy_from_dotenv"


def test_missing_key_raises_helpful_error():
    env: dict[str, str] = {}

    with pytest.raises(RuntimeError) as exc:
        ensure_google_genai_api_key(env=env, search_paths=[])

    assert "GOOGLE_GENAI_API_KEY is not configured" in str(exc.value)


def test_optional_flag_allows_missing_key():
    env: dict[str, str] = {}

    assert ensure_google_genai_api_key(env=env, search_paths=[], optional=True) is None
    