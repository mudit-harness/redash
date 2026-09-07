import requests

try:
    import google.auth
    from apiclient.discovery import build

    enabled = True
except ImportError:
    enabled = False

from redash import settings
from redash.query_runner import register

from .big_query import BigQuery


class BigQueryGCE(BigQuery):
    @classmethod
    def type(cls):
        return "bigquery_gce"

    @classmethod
    def enabled(cls):
        if not enabled:
            return False

        try:
            # check if we're on a GCE instance. The metadata server is link local and
            # answers in milliseconds, so a short timeout is enough: anything slower is
            # treated the same way as an unreachable metadata server.
            requests.get("http://metadata.google.internal", timeout=settings.REQUESTS_SHORT_TIMEOUT)
        except (requests.exceptions.ConnectionError, requests.exceptions.Timeout):
            return False

        return True

    @classmethod
    def configuration_schema(cls):
        return {
            "type": "object",
            "properties": {
                "totalMBytesProcessedLimit": {
                    "type": "number",
                    "title": "Total MByte Processed Limit",
                },
                "userDefinedFunctionResourceUri": {
                    "type": "string",
                    "title": "UDF Source URIs (i.e. gs://bucket/date_utils.js, gs://bucket/string_utils.js )",
                },
                "useStandardSql": {
                    "type": "boolean",
                    "title": "Use Standard SQL",
                    "default": True,
                },
                "location": {
                    "type": "string",
                    "title": "Processing Location",
                    "default": "US",
                },
                "loadSchema": {"type": "boolean", "title": "Load Schema"},
            },
        }

    def _get_project_id(self):
        google.auth.default()[1]

    def _get_bigquery_service(self):
        creds = google.auth.default(scopes=["https://www.googleapis.com/auth/bigquery"])[0]
        return build("bigquery", "v2", credentials=creds, cache_discovery=False)


register(BigQueryGCE)
