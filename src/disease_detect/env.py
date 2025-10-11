"""Utilities for configuring access to the Google Generative AI API."""
from __future__ import annotations

from pathlib import Path
from typing import Iterable, MutableMapping, Optional
import os

DEFAULT_ENV_FILENAMES: tuple[str, ...] = (".env", ".env.local", ".env.sample")
GOOGLE_GENAI_ENV_VAR = "GOOGLE_GENAI_API_KEY"
GOOGLE_API_ENV_VAR = "GOOGLE_API_KEY"


def _parse_dotenv(path: Path) -> dict[str, str]:
    """Parse a dotenv file into a dictionary.

    The parser is intentionally small and handles the subset of syntax that is commonly used
    in simple projects: ``KEY=value`` pairs, ignoring blank lines and comments.  Quoted values
    are unwrapped so that multi-word keys may be provided without leaking the quote characters
    into the resulting string.
    """

    data: dict[str, str] = {}
    for raw_line in path.read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        key, sep, value = line.partition("=")
        if not sep:
            # Ignore malformed entries rather than failing outright.  This keeps the loader
            # resilient to unrelated configuration values.
            continue
        key = key.strip()
        value = value.strip()
        if value and value[0] == value[-1] and value[0] in {'"', "'"}:
            value = value[1:-1]
        data[key] = value
    return data


def _iter_search_paths(search_paths: Optional[Iterable[Path]]) -> Iterable[Path]:
    if search_paths is not None:
        for candidate in search_paths:
            if candidate is None:
                continue
            yield candidate
        return

    cwd = Path.cwd()
    project_root = Path(__file__).resolve().parent.parent.parent
    seen: set[Path] = set()
    for base in (cwd, project_root):
        for name in DEFAULT_ENV_FILENAMES:
            candidate = base / name
            if candidate in seen:
                continue
            seen.add(candidate)
            yield candidate


def ensure_google_genai_api_key(
    *,
    env: Optional[MutableMapping[str, str]] = None,
    search_paths: Optional[Iterable[Path]] = None,
    optional: bool = False,
) -> Optional[str]:
    """Ensure that the Google Generative AI API key is available.

    The Google SDK currently reads the API key from the ``GOOGLE_GENAI_API_KEY`` environment
    variable.  However, several guides (and even Google's own documentation) still refer to the
    older ``GOOGLE_API_KEY`` name.  This helper accepts either variant and will synchronise the
    values so that the SDK consistently sees the expected variable.

    In addition, ``.env`` files commonly used in local development are automatically inspected if
    no key is found in ``env``.

    Parameters
    ----------
    env:
        A mutable mapping representing the environment to inspect.  Defaults to :data:`os.environ`.
    search_paths:
        Explicit paths to search for dotenv files.  When omitted a handful of sensible defaults are
        checked relative to the current working directory and the project root.
    optional:
        When ``True`` the function returns ``None`` instead of raising when no key can be located.

    Returns
    -------
    Optional[str]
        The discovered API key or ``None`` when ``optional`` is ``True`` and no key was found.

    Raises
    ------
    RuntimeError
        If the key cannot be located and ``optional`` is ``False``.
    """

    environment = os.environ if env is None else env

    existing = environment.get(GOOGLE_GENAI_ENV_VAR)
    if existing:
        return existing

    legacy = environment.get(GOOGLE_API_ENV_VAR)
    if legacy:
        environment[GOOGLE_GENAI_ENV_VAR] = legacy
        return legacy

    for path in _iter_search_paths(search_paths):
        if not path or not path.is_file():
            continue
        parsed = _parse_dotenv(path)
        value = parsed.get(GOOGLE_GENAI_ENV_VAR) or parsed.get(GOOGLE_API_ENV_VAR)
        if value:
            environment.setdefault(GOOGLE_GENAI_ENV_VAR, value)
            if GOOGLE_API_ENV_VAR not in environment and GOOGLE_API_ENV_VAR in parsed:
                environment[GOOGLE_API_ENV_VAR] = parsed[GOOGLE_API_ENV_VAR]
            return value

    if optional:
        return None

    raise RuntimeError(
        "GOOGLE_GENAI_API_KEY is not configured. Set either GOOGLE_GENAI_API_KEY or "
        "GOOGLE_API_KEY as an environment variable or provide a .env file containing one of "
        "those values."
    )


__all__ = ["ensure_google_genai_api_key", "GOOGLE_GENAI_ENV_VAR", "GOOGLE_API_ENV_VAR"]