"""
Rx-Guard appropriateness scoring microservice (whitepaper section 7.6.1).

Exposes POST /score, called by the prescriber-facing front-end at the point of
prescription. Serves a PubMedBERT model fine-tuned for this task
(finetune_biobert.py) rather than the decision-tree baseline this project
started with -- see ai-service/README.md for why and what changed.
Returns an AWaRe category, an appropriateness score, and the model version
hash that the backend commits on-chain alongside the prescription
(whitepaper table 7.4: "AI model version hash -> On chain").
"""

import hashlib
import json
from functools import lru_cache
from pathlib import Path

import torch
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from transformers import AutoModelForSequenceClassification, AutoTokenizer

MODEL_DIR = Path(__file__).parent / "model" / "biobert_appropriateness"
DATA_PATH = Path(__file__).parent / "data" / "aware_training_data.json"

app = FastAPI(title="Rx-Guard Appropriateness Service")

_model = None
_tokenizer = None
_model_version = None


def diagnosis_drug_to_text(diagnosis: str, drug: str) -> str:
    diagnosis_text = diagnosis.replace("_", " ")
    drug_text = drug.replace("_", " ")
    return f"Patient diagnosis: {diagnosis_text}. Proposed antibiotic: {drug_text}."


def get_model():
    global _model, _tokenizer, _model_version
    if _model is None:
        if not MODEL_DIR.exists():
            raise RuntimeError(
                "Fine-tuned model not found. Run `python finetune_biobert.py` first."
            )
        _tokenizer = AutoTokenizer.from_pretrained(MODEL_DIR)
        _model = AutoModelForSequenceClassification.from_pretrained(MODEL_DIR)
        _model.eval()
        with open(MODEL_DIR / "version.json", encoding="utf-8") as f:
            _model_version = json.load(f)["version"]
    return _model, _tokenizer, _model_version


@lru_cache(maxsize=1)
def get_reference_data():
    with open(DATA_PATH, encoding="utf-8") as f:
        rows = json.load(f)
    drug_to_aware = {r["drug"]: r["aware_category"] for r in rows}
    return rows, drug_to_aware


def model_version_hash(version: str) -> str:
    return hashlib.sha256(version.encode("utf-8")).hexdigest()


class ScoreRequest(BaseModel):
    diagnosis: str
    drug: str


class ScoreResponse(BaseModel):
    diagnosis: str
    drug: str
    aware_category: str
    appropriateness_score: float
    recommendation: str
    alternative_drug: str | None
    model_version: str
    model_version_hash: str


@app.post("/score", response_model=ScoreResponse)
def score(req: ScoreRequest):
    model, tokenizer, version = get_model()
    rows, drug_to_aware = get_reference_data()

    if req.drug not in drug_to_aware:
        raise HTTPException(status_code=400, detail=f"Unknown drug code: {req.drug}")

    text = diagnosis_drug_to_text(req.diagnosis, req.drug)
    inputs = tokenizer(text, return_tensors="pt", truncation=True, max_length=64)

    with torch.no_grad():
        logits = model(**inputs).logits
        probs = torch.softmax(logits, dim=-1)[0]

    # label 1 = "appropriate" (see finetune_biobert.py / generate_data.py)
    appropriateness_score = float(probs[1])

    alternative = None
    if appropriateness_score < 0.5:
        alternative = _suggest_alternative(req.diagnosis, rows, drug_to_aware)

    recommendation = "accept" if appropriateness_score >= 0.5 else "review_alternative"

    return ScoreResponse(
        diagnosis=req.diagnosis,
        drug=req.drug,
        aware_category=drug_to_aware[req.drug],
        appropriateness_score=round(appropriateness_score, 3),
        recommendation=recommendation,
        alternative_drug=alternative,
        model_version=version,
        model_version_hash=model_version_hash(version)
    )


def _suggest_alternative(diagnosis: str, rows: list, drug_to_aware: dict) -> str | None:
    # Prefer suggesting the lowest-AWaRe-tier drug known to be first-line for
    # this diagnosis in the training data, biasing the model toward Access.
    candidates = [r["drug"] for r in rows if r["diagnosis"] == diagnosis and r["appropriate"] == 1]
    if not candidates:
        return None
    tier_rank = {"ACCESS": 0, "WATCH": 1, "RESERVE": 2}
    candidates = sorted(set(candidates), key=lambda d: tier_rank.get(drug_to_aware.get(d, "RESERVE"), 3))
    return candidates[0]


@app.get("/health")
def health():
    return {"status": "ok"}
