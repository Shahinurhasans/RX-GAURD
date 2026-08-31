"""
Rx-Guard appropriateness scoring microservice (whitepaper section 7.6.1).

Exposes POST /score, called by the prescriber-facing front-end at the point of
prescription. Returns an AWaRe category, an appropriateness score, and the
model version hash that the backend commits on-chain alongside the
prescription (whitepaper table 7.4: "AI model version hash -> On chain").
"""

import hashlib
import pickle
from pathlib import Path

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

MODEL_PATH = Path(__file__).parent / "model" / "appropriateness_model.pkl"

app = FastAPI(title="Rx-Guard Appropriateness Service")

_model_bundle = None


def get_model():
    global _model_bundle
    if _model_bundle is None:
        if not MODEL_PATH.exists():
            raise RuntimeError("Model not trained yet. Run `python train.py` first.")
        with open(MODEL_PATH, "rb") as f:
            _model_bundle = pickle.load(f)
    return _model_bundle


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
    bundle = get_model()
    vectorizer = bundle["vectorizer"]
    clf = bundle["classifier"]
    drug_to_aware = bundle["drug_to_aware"]

    if req.drug not in drug_to_aware:
        raise HTTPException(status_code=400, detail=f"Unknown drug code: {req.drug}")

    X = vectorizer.transform([{"diagnosis": req.diagnosis, "drug": req.drug}])
    proba = clf.predict_proba(X)[0]
    # class order follows clf.classes_, typically [0, 1]
    classes = list(clf.classes_)
    appropriate_idx = classes.index(1) if 1 in classes else 0
    appropriateness_score = float(proba[appropriate_idx])

    alternative = None
    if appropriateness_score < 0.5:
        alternative = _suggest_alternative(req.diagnosis, drug_to_aware)

    recommendation = "accept" if appropriateness_score >= 0.5 else "review_alternative"

    return ScoreResponse(
        diagnosis=req.diagnosis,
        drug=req.drug,
        aware_category=drug_to_aware[req.drug],
        appropriateness_score=round(appropriateness_score, 3),
        recommendation=recommendation,
        alternative_drug=alternative,
        model_version=bundle["version"],
        model_version_hash=model_version_hash(bundle["version"])
    )


def _suggest_alternative(diagnosis: str, drug_to_aware: dict) -> str | None:
    # Prefer suggesting the lowest-AWaRe-tier drug known to be first-line for
    # this diagnosis in the training data, biasing the model toward Access.
    import json
    data_path = Path(__file__).parent / "data" / "aware_training_data.json"
    if not data_path.exists():
        return None
    with open(data_path, encoding="utf-8") as f:
        rows = json.load(f)
    candidates = [r["drug"] for r in rows if r["diagnosis"] == diagnosis and r["appropriate"] == 1]
    if not candidates:
        return None
    tier_rank = {"ACCESS": 0, "WATCH": 1, "RESERVE": 2}
    candidates.sort(key=lambda d: tier_rank.get(drug_to_aware.get(d, "RESERVE"), 3))
    return candidates[0]


@app.get("/health")
def health():
    return {"status": "ok"}
