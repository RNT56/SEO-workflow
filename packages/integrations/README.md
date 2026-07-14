# @seo-polish/integrations

Typed normalization and provider helpers for optional search and field evidence. The package normalizes Search Console
query rows and CrUX percentile data, validates imported metric files, and supports bounded IndexNow submission.

Imported data stays labeled separately from crawler-observed evidence. IndexNow requires explicit approval, rejects
cross-host URLs, and validates key and URL-count limits before making a request.

Licensed under the Apache License, Version 2.0.
