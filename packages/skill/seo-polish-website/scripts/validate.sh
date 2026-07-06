#!/usr/bin/env bash
set -euo pipefail

seo-polish report lint "${1:-seo-polish-report}" --strict

