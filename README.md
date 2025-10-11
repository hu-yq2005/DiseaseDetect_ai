# DiseaseDetect

This repository contains small utilities that make it easier to configure the Google Generative AI
SDK that DiseaseDetect relies on.  The helper synchronises the ``GOOGLE_GENAI_API_KEY`` and
``GOOGLE_API_KEY`` environment variables and can populate them automatically from a ``.env`` file.

## Configuring the API key

1. Create a ``.env`` file in the project root with one of the following lines:
   ```env
   GOOGLE_GENAI_API_KEY=your-api-key
   ```
   or
   ```env
   GOOGLE_API_KEY=your-api-key
   ```
2. Alternatively, export either variable in your shell before starting the application.

The :func:`disease_detect.ensure_google_genai_api_key` function will look for both variable names
and sets the one required by the Google SDK when it finds a value.

## Development

Install the development dependencies and run the test-suite:

```bash
pip install -e .[dev]
pytest
```
