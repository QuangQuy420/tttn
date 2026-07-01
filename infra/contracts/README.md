# Shared API Contracts

OpenAPI specs (and/or proto) shared across all repos. Each service publishes its
contract here; other repos consume them via **git submodule** or a versioned copy
(mechanism locked in STORY-1.1).

```
contracts/
  user-service.openapi.yaml
  product-service.openapi.yaml
  order-service.openapi.yaml
  payment-service.openapi.yaml
  face-processing-service.openapi.yaml
  recommendation-service.openapi.yaml
```
