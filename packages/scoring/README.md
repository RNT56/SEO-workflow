# @seo-polish/scoring

Computes technical SEO, content, performance/accessibility, security/policy, agent-readiness and combined scores.

Scores are calculated from unique grouped issue identities with a capped repeat penalty for affected URLs or
templates. Repeated URL-level evidence should increase impact, but one repeated template issue must not collapse
a category to `0/100` as if every affected page were an independent defect.
