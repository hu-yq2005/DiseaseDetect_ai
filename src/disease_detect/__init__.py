"""DiseaseDetect utilities.

The package automatically attempts to load the Google GenAI API key on import so that
applications which simply ``import disease_detect`` pick up keys specified in ``.env`` files
without any additional setup.  When no key is present the import still succeeds and downstream
code can decide how to handle the missing configuration.
"""

from .env import (
    GOOGLE_API_ENV_VAR,
    GOOGLE_GENAI_ENV_VAR,
    ensure_google_genai_api_key,
)

# Try to populate ``os.environ`` from common .env locations so that the SDK can find the key when
# DiseaseDetect is imported in a web context (e.g. when clicking "Assess Now" in the UI).
ensure_google_genai_api_key(optional=True)

__all__ = ["ensure_google_genai_api_key", "GOOGLE_GENAI_ENV_VAR", "GOOGLE_API_ENV_VAR"]