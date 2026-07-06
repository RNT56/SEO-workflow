# @seo-polish/standards-registry

Versioned standards metadata for rules and report references.

The package exports:

- `STANDARDS`
- `RULE_MAPPING`
- `buildStandardsSnapshot()`
- `validateStandardsRegistry()`

`validateStandardsRegistry()` checks that every catalog rule is mapped to a known reviewed standard and
that mappings match the rule catalog.
