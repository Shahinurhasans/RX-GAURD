"""
Fine-tunes a biomedical BERT (PubMedBERT) for prescription appropriateness
classification -- the "small transformer" described in whitepaper section
7.6.1, starting from weights pretrained on biomedical literature rather than
general English, since the input vocabulary (diagnoses, drug names) is
clinical.

Input: a short clinical text built from the diagnosis and proposed drug.
Output: binary appropriate / not-appropriate classification, whose
probability becomes the appropriateness_score served by service.py.

Usage:
    python finetune_biobert.py
"""

import json
from pathlib import Path

import numpy as np
import torch
from sklearn.metrics import classification_report
from sklearn.model_selection import train_test_split
from transformers import (
    AutoModelForSequenceClassification,
    AutoTokenizer,
    Trainer,
    TrainingArguments,
)

BASE_MODEL = "microsoft/BiomedNLP-PubMedBERT-base-uncased-abstract-fulltext"
MODEL_VERSION = "pubmedbert-appropriateness-v1.0.0"

DATA_PATH = Path(__file__).parent / "data" / "aware_training_data.json"
OUTPUT_DIR = Path(__file__).parent / "model" / "biobert_appropriateness"


def diagnosis_drug_to_text(diagnosis: str, drug: str) -> str:
    """Turns the structured (diagnosis, drug) pair into a short clinical
    sentence a text classifier can consume."""
    diagnosis_text = diagnosis.replace("_", " ")
    drug_text = drug.replace("_", " ")
    return f"Patient diagnosis: {diagnosis_text}. Proposed antibiotic: {drug_text}."


class RxDataset(torch.utils.data.Dataset):
    def __init__(self, encodings, labels):
        self.encodings = encodings
        self.labels = labels

    def __len__(self):
        return len(self.labels)

    def __getitem__(self, idx):
        item = {k: v[idx] for k, v in self.encodings.items()}
        item["labels"] = torch.tensor(self.labels[idx])
        return item


def compute_metrics(eval_pred):
    logits, labels = eval_pred
    preds = np.argmax(logits, axis=-1)
    report = classification_report(labels, preds, output_dict=True, zero_division=0)
    return {
        "accuracy": report["accuracy"],
        "f1_appropriate": report.get("1", {}).get("f1-score", 0.0),
    }


def main():
    with open(DATA_PATH, encoding="utf-8") as f:
        rows = json.load(f)

    texts = [diagnosis_drug_to_text(r["diagnosis"], r["drug"]) for r in rows]
    labels = [r["appropriate"] for r in rows]

    train_texts, val_texts, train_labels, val_labels = train_test_split(
        texts, labels, test_size=0.2, random_state=42, stratify=labels
    )

    print(f"Loading tokenizer/model: {BASE_MODEL}")
    tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL)
    model = AutoModelForSequenceClassification.from_pretrained(BASE_MODEL, num_labels=2)

    train_encodings = tokenizer(train_texts, truncation=True, padding=True, max_length=64)
    val_encodings = tokenizer(val_texts, truncation=True, padding=True, max_length=64)

    train_encodings = {k: torch.tensor(v) for k, v in train_encodings.items()}
    val_encodings = {k: torch.tensor(v) for k, v in val_encodings.items()}

    train_dataset = RxDataset(train_encodings, train_labels)
    val_dataset = RxDataset(val_encodings, val_labels)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    training_args = TrainingArguments(
        output_dir=str(OUTPUT_DIR / "checkpoints"),
        num_train_epochs=8,
        per_device_train_batch_size=16,
        per_device_eval_batch_size=32,
        learning_rate=3e-5,
        eval_strategy="epoch",
        save_strategy="no",
        logging_steps=10,
        report_to=[],
    )

    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_dataset,
        eval_dataset=val_dataset,
        compute_metrics=compute_metrics,
    )

    trainer.train()

    print("\nFinal held-out evaluation:")
    print(trainer.evaluate())

    model.save_pretrained(OUTPUT_DIR)
    tokenizer.save_pretrained(OUTPUT_DIR)

    with open(OUTPUT_DIR / "version.json", "w", encoding="utf-8") as f:
        json.dump({"version": MODEL_VERSION, "base_model": BASE_MODEL}, f, indent=2)

    print(f"\nSaved fine-tuned model to {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
