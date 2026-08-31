# Rx-Guard appropriateness service

Implements whitepaper §7.6.1 ("Prescription Appropriateness Classification")
at prototype scale.

## What's real vs. simplified here

| Whitepaper (§7.6.1, production) | This prototype |
|---|---|
| Small transformer with structured input embeddings | `sklearn.tree.DecisionTreeClassifier` over one-hot `(diagnosis, drug)` pairs |
| Trained on ICDDR,B microbiology data + expert-panel-reviewed prescribing decisions | Trained on `data/aware_training_data.json`, a synthetic dataset generated from a hand-coded first-line-therapy rule table (`generate_data.py`) |
| Runs on-device on prescriber's mobile phone | Runs as a FastAPI microservice (`service.py`), called by the backend over HTTP |
| Every model version hashed and recorded on chain (§7.7) | `model_version_hash` is computed and returned in every response; the backend commits it into the prescription record's `modelVersionHash` field on the ledger |

The interface — `{diagnosis, drug} -> {aware_category, appropriateness_score,
recommendation, alternative_drug, model_version_hash}` — is what matters for
the integration and is what a production model would need to preserve. A real
deployment would swap `train.py`/`service.py` for the transformer pipeline
without changing `backend/src/server.js` or the chaincode.

## Retraining

```bash
python -m venv .venv
.venv/bin/pip install -r requirements.txt      # .venv\Scripts\pip on Windows
python generate_data.py                        # regenerate the synthetic dataset
python train.py                                 # writes model/appropriateness_model.pkl
uvicorn service:app --port 8001                 # serve /score
```

`train.py` prints a held-out precision/recall report on every run so model
quality is visible before it's wired into the backend.

## Known limitation

The synthetic dataset encodes a small, hand-picked set of diagnoses and drugs
with deterministic first-line labels — it demonstrates the mechanism, not
clinical accuracy. It must not be used, as-is, to inform a real prescribing
decision; whitepaper §7.6.1 and §7.7 (federated learning across ICDDR,B and
hospital partners) describe what replacing it for production requires.
