# Rx-Guard appropriateness service

Implements whitepaper §7.6.1 ("Prescription Appropriateness Classification")
at prototype scale: a **fine-tuned PubMedBERT** model
(`microsoft/BiomedNLP-PubMedBERT-base-uncased-abstract-fulltext`), rather than
a general-English model, since the inputs are clinical terms (diagnoses, drug
names).

## What's real vs. simplified here

| Whitepaper (§7.6.1, production) | This prototype |
|---|---|
| Small transformer with structured input embeddings | PubMedBERT fine-tuned for binary appropriateness classification (`finetune_biobert.py`) |
| Trained on ICDDR,B microbiology data + expert-panel-reviewed prescribing decisions | Fine-tuned on `data/aware_training_data.json`, a synthetic dataset generated from a hand-coded first-line-therapy rule table (`generate_data.py`) |
| Runs on-device on prescriber's mobile phone | Runs as a FastAPI microservice (`service.py`), called by the backend over HTTP |
| Every model version hashed and recorded on chain (§7.7) | `model_version_hash` is computed and returned in every response; the backend commits it into the prescription record's `modelVersionHash` field on the ledger |

The interface — `{diagnosis, drug} -> {aware_category, appropriateness_score,
recommendation, alternative_drug, model_version_hash}` — is what matters for
the integration and is what a production model would need to preserve.
Swapping in a larger or differently-trained model later means retraining
`finetune_biobert.py` and pointing `service.py` at the new checkpoint;
`backend/src/server.js` and the chaincode don't need to change.

### Why PubMedBERT and not the general-English baseline

An earlier version of this service used a `scikit-learn` decision tree over
one-hot `(diagnosis, drug)` pairs (still in `train.py`/`generate_data.py` for
reference). It worked, but a plain decision tree has no path to the richer
input a production model would actually need — e.g. free-text diagnosis
notes, patient history, local resistance context. PubMedBERT starts from
weights already pretrained on biomedical abstracts, so fine-tuning it here is
a much closer stand-in for whitepaper §7.6.1's "small transformer with
structured input embeddings" than a tree ever could be, and the same
fine-tuning pipeline scales to richer clinical text without a redesign.

## Retraining

```bash
python -m venv .venv
.venv/bin/pip install -r requirements.txt          # .venv\Scripts\pip on Windows
python generate_data.py                             # regenerate the synthetic dataset
python finetune_biobert.py                           # fine-tunes PubMedBERT, writes model/biobert_appropriateness/
uvicorn service:app --port 8001                       # serve /score
```

`finetune_biobert.py` prints held-out accuracy/F1 after training so model
quality is visible before it's wired into the backend. First run downloads
the base PubMedBERT checkpoint (~420MB) from Hugging Face.

## Known limitation

The synthetic dataset encodes a small, hand-picked set of diagnoses and drugs
with deterministic first-line labels — it demonstrates the mechanism, not
clinical accuracy. Fine-tuning a biomedical transformer on it does not fix
that; it only gets the *architecture* closer to production. This must not be
used, as-is, to inform a real prescribing decision; whitepaper §7.6.1 and
§7.7 (federated learning across ICDDR,B and hospital partners) describe what
replacing it for production requires.
