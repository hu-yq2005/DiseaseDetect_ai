export type Sex = "male" | "female" | "other" | "unknown";

export interface Intake {
  age: number;
  heightCm?: number;
  weightKg?: number;
  sex: Sex;
  durationDays?: number;
  chiefComplaint: string;
  symptoms: string[];
  riskFactors?: string[];
}

export interface RuleHit {
  conditionId: string;
  score: number;
}

export interface ConditionRule {
  id: string;
  label: string;
  dept: string;
  keywords: Record<string, number>;
  modifiers?: Record<string, number>;
  otcHints?: string[];
  redFlag?: boolean;
}
