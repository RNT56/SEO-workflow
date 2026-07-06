#!/usr/bin/env bash
set -euo pipefail

seo-polish scan "$1" --output "${2:-seo-polish-report}"

