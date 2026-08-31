"""
Rx-Guard prescription appropriateness classifier.

Trains a small model that maps (diagnosis, proposed_drug) -> WHO AWaRe category
plus an appropriateness score, using a synthetic labelled dataset built from
published AWaRe classification lists and common first-line therapy guidance.
This stands in, at prototype scale, for the "small transformer with structured
input embeddings" described in whitepaper section 7.6.1 -- the interface
(diagnosis + drug in, category + score out) is what the chaincode and pharmacy
app consume, so the model can be swapped for a larger one without changing the
integration.
"""

import json
import pickle
from pathlib import Path

from sklearn.feature_extraction import DictVectorizer
from sklearn.tree import DecisionTreeClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report

DATA_PATH = Path(__file__).parent / "data" / "aware_training_data.json"
MODEL_PATH = Path(__file__).parent / "model" / "appropriateness_model.pkl"
MODEL_VERSION = "aware-v0.1.0"


def load_dataset():
    with open(DATA_PATH, "r", encoding="utf-8") as f:
        rows = json.load(f)
    X = [{"diagnosis": r["diagnosis"], "drug": r["drug"]} for r in rows]
    y_category = [r["aware_category"] for r in rows]
    y_appropriate = [r["appropriate"] for r in rows]
    return X, y_category, y_appropriate


def main():
    X, y_category, y_appropriate = load_dataset()

    vectorizer = DictVectorizer(sparse=False)
    X_vec = vectorizer.fit_transform(X)

    X_train, X_test, y_train, y_test = train_test_split(
        X_vec, y_appropriate, test_size=0.25, random_state=42, stratify=y_appropriate
    )

    clf = DecisionTreeClassifier(max_depth=6, class_weight="balanced", random_state=42)
    clf.fit(X_train, y_train)

    preds = clf.predict(X_test)
    print("Held-out evaluation (appropriateness label):")
    print(classification_report(y_test, preds))

    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(MODEL_PATH, "wb") as f:
        pickle.dump({
            "vectorizer": vectorizer,
            "classifier": clf,
            "version": MODEL_VERSION,
            "drug_to_aware": {r["drug"]: r["aware_category"] for r in
                              json.load(open(DATA_PATH, encoding="utf-8"))}
        }, f)

    print(f"Saved model {MODEL_VERSION} to {MODEL_PATH}")


if __name__ == "__main__":
    main()
