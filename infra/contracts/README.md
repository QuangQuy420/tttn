# Shared API Contracts

OpenAPI specs (and/or proto) shared across all repos. Each service publishes its
contract here; other repos consume them via **git submodule** or a versioned copy
(mechanism locked in STORY-1.1).

```
contracts/
  auth.openapi.yaml
  catalog.openapi.yaml
  order.openapi.yaml
  face.openapi.yaml
  reco.openapi.yaml
```
