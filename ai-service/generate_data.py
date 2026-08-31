"""
Generates a synthetic (diagnosis, drug) -> AWaRe category / appropriateness
labelled dataset for the prototype appropriateness classifier.

The clinical rules below are a deliberately simplified stand-in for the expert
panel review described in whitepaper section 7.6.1 -- accurate enough to
demonstrate the mechanism end-to-end, not a substitute for real ICDDR,B /
guideline-derived labels that a production model would require.
"""

import itertools
import json
import random
from pathlib import Path

random.seed(7)

DRUG_AWARE = {
    "amoxicillin": "ACCESS",
    "nitrofurantoin": "ACCESS",
    "doxycycline": "ACCESS",
    "metronidazole": "ACCESS",
    "gentamicin": "ACCESS",
    "amoxicillin_clavulanate": "ACCESS",
    "ampicillin": "ACCESS",
    "ciprofloxacin": "WATCH",
    "azithromycin": "WATCH",
    "ceftriaxone": "WATCH",
    "cefixime": "WATCH",
    "clarithromycin": "WATCH",
    "meropenem": "RESERVE",
    "colistin": "RESERVE",
    "linezolid": "RESERVE",
    "tigecycline": "RESERVE",
}

# first-line-appropriate drug set per diagnosis (simplified local guideline stand-in)
FIRST_LINE = {
    "uti_uncomplicated": {"nitrofurantoin", "amoxicillin"},
    "uti_complicated": {"ciprofloxacin", "ceftriaxone"},
    "typhoid": {"azithromycin", "ceftriaxone", "amoxicillin"},
    "neonatal_sepsis": {"ampicillin", "gentamicin"},
    "pneumonia_cap": {"amoxicillin"},
    "skin_soft_tissue": {"amoxicillin_clavulanate"},
    "gonorrhea": {"ceftriaxone"},
    "meningitis": {"ceftriaxone"},
}

# drugs that are clinically defensible as escalation, not first-line-appropriate
ESCALATION_ONLY = {
    "uti_complicated": {"meropenem"},
    "neonatal_sepsis": {"meropenem", "colistin"},
    "meningitis": {"meropenem"},
}


def label_row(diagnosis, drug):
    first_line = FIRST_LINE.get(diagnosis, set())
    escalation = ESCALATION_ONLY.get(diagnosis, set())
    if drug in first_line:
        return 1
    if drug in escalation:
        return 0  # inappropriate as an unjustified first prescription
    return 0


def main():
    rows = []
    for diagnosis, drug in itertools.product(FIRST_LINE.keys(), DRUG_AWARE.keys()):
        appropriate = label_row(diagnosis, drug)
        rows.append({
            "diagnosis": diagnosis,
            "drug": drug,
            "aware_category": DRUG_AWARE[drug],
            "appropriate": appropriate
        })

    # oversample a bit with shuffled duplicates so the classifier has more to learn from
    augmented = list(rows)
    for _ in range(6):
        sample = random.sample(rows, k=len(rows) // 2)
        augmented.extend(sample)
    random.shuffle(augmented)

    out_path = Path(__file__).parent / "data" / "aware_training_data.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(augmented, f, indent=2)

    print(f"Wrote {len(augmented)} rows to {out_path}")


if __name__ == "__main__":
    main()
