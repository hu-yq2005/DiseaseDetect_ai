import type { ConditionRule, Intake } from "./schema";

export const RED_FLAGS_TEXT = [
  "severe chest pain with shortness of breath",
  "one-sided weakness or slurred speech",
  "severe breathing difficulty",
  "pregnancy with abdominal pain or bleeding",
  "stiff neck with high fever",
  "anaphylaxis signs",
];

export const RULES: ConditionRule[] = [
  {
    id: "uri_pharyngitis",
    label: "Upper Respiratory Infection / Pharyngitis",
    dept: "Primary Care / ENT",
    keywords: {
      "sore throat": 3,
      fever: 2,
      "runny nose": 2,
      cough: 1,
      sneezing: 1,
    },
    modifiers: {
      "duration<=7": 1,
      "age<65": 1,
    },
    otcHints: [
      "fluids and rest",
      "acetaminophen or ibuprofen for fever and pain",
      "salt-water gargle",
    ],
  },
  {
    id: "influenza_like",
    label: "Influenza-like Illness",
    dept: "Primary Care / Urgent Care",
    keywords: {
      "sudden onset": 2,
      "high fever": 3,
      chills: 2,
      myalgia: 3,
      "dry cough": 2,
      headache: 2,
    },
    modifiers: {
      "duration<=5": 1,
    },
    otcHints: ["antipyretic", "hydration", "rest"],
  },
  {
    id: "gerd",
    label: "Gastroesophageal Reflux",
    dept: "Gastroenterology / Primary Care",
    keywords: {
      heartburn: 3,
      "acid reflux": 3,
      "worse at night": 2,
      "throat clearing": 1,
    },
    otcHints: ["lifestyle adjustments", "antacid class (e.g., calcium carbonate)"],
  },
  {
    id: "uti",
    label: "Urinary Tract Irritation/Infection",
    dept: "Primary Care / Urology",
    keywords: {
      "painful urination": 3,
      "frequent urination": 3,
      urgency: 2,
      "lower abdominal pain": 1,
    },
    otcHints: ["hydration", "phenazopyridine for symptom relief"],
  },
  {
    id: "migraine",
    label: "Migraine Headache",
    dept: "Neurology / Primary Care",
    keywords: {
      "throbbing headache": 3,
      "light sensitivity": 2,
      "sound sensitivity": 2,
      nausea: 2,
      "visual aura": 3,
    },
    modifiers: {
      "duration<=3": 1,
    },
    otcHints: ["rest in dark room", "OTC migraine formulations"],
  },
  {
    id: "low_back_strain",
    label: "Mechanical Low Back Strain",
    dept: "Physical Medicine / Orthopedics",
    keywords: {
      "lower back pain": 3,
      "worse with movement": 2,
      stiffness: 1,
      "lifting injury": 2,
    },
    modifiers: {
      "duration<=14": 1,
      "age<65": 1,
    },
    otcHints: ["gentle stretching", "heat packs", "OTC NSAID class"],
  },
];

export function isLocalRedFlag(intake: Intake): boolean {
  const text = (intake.chiefComplaint + " " + intake.symptoms.join(" ")).toLowerCase();
  return RED_FLAGS_TEXT.some((flag) => text.includes(flag));
}

function addModifierScore(intake: Intake, rule: ConditionRule, base: number) {
  if (!rule.modifiers) return base;
  let score = base;
  if (intake.durationDays !== undefined) {
    if (intake.durationDays <= 7 && rule.modifiers["duration<=7"]) {
      score += rule.modifiers["duration<=7"];
    }
    if (intake.durationDays <= 5 && rule.modifiers["duration<=5"]) {
      score += rule.modifiers["duration<=5"];
    }
    if (intake.durationDays <= 3 && rule.modifiers["duration<=3"]) {
      score += rule.modifiers["duration<=3"];
    }
    if (intake.durationDays <= 14 && rule.modifiers["duration<=14"]) {
      score += rule.modifiers["duration<=14"];
    }
  }
  if (intake.age < 12 && rule.modifiers["age<12"]) {
    score += rule.modifiers["age<12"];
  }
  if (intake.age < 65 && rule.modifiers["age<65"]) {
    score += rule.modifiers["age<65"];
  }
  return score;
}

export function scoreConditions(intake: Intake) {
  const text = (intake.chiefComplaint + " " + intake.symptoms.join(" ")).toLowerCase();
  const scored = RULES.map((rule) => {
    let score = 0;
    for (const [keyword, weight] of Object.entries(rule.keywords)) {
      if (text.includes(keyword)) {
        score += weight;
      }
    }
    score = addModifierScore(intake, rule, score);
    return { id: rule.id, score };
  });

  const total = scored.reduce((sum, entry) => sum + entry.score, 0) || 1;

  return scored
    .map((entry) => ({ ...entry, score: Number((entry.score / total).toFixed(3)) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
}
