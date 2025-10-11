import { GoogleGenerativeAI } from "@google/generative-ai";
import type { Intake } from "./schema";

export const TRIAGE_LEVELS = ["home", "pcp", "urgent", "emergent"] as const;
const DEFAULT_MODEL_CANDIDATES = [
  // Gemini 2.5 family (preferred if available)
  "gemini-2.5-pro",
  "gemini-2.5-pro-preview-06-05",
  "gemini-2.5-pro-preview-05-06",
  "gemini-2.5-pro-preview-03-25",
  "gemini-2.5-pro-preview-tts",
  "gemini-2.5-flash",
  "gemini-2.5-flash-preview-05-20",
  "gemini-2.5-flash-preview-tts",
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash-lite-preview-06-17",
  "gemini-2.5-flash-lite-preview-09-2025",
  "gemini-2.5-flash-preview-09-2025",
  "gemini-2.5-flash-preview-10-2025",
  // Gemini 2.0 family
  "gemini-2.0-flash",
  "gemini-2.0-flash-001",
  "gemini-2.0-flash-exp",
  "gemini-2.0-flash-lite",
  "gemini-2.0-flash-lite-001",
  "gemini-2.0-flash-lite-preview-02-05",
  "gemini-2.0-flash-thinking-exp",
  "gemini-2.0-flash-thinking-exp-01-21",
  "gemini-2.0-flash-thinking-exp-1219",
  "gemini-2.0-flash-preview-image-generation",
  "gemini-2.0-flash-exp-image-generation",
  "gemini-2.0-pro-exp",
  "gemini-2.0-pro-exp-02-05",
  // Gemini 1.x fallback
  "gemini-flash-latest",
  "gemini-flash-lite-latest",
  "gemini-pro-latest",
  "gemini-1.5-pro-latest",
  "gemini-1.5-pro",
  "gemini-1.5-flash-latest",
  "gemini-1.5-flash",
  "gemini-1.0-pro",
  "gemini-pro",
] as const;

export type TriageLevel = (typeof TRIAGE_LEVELS)[number];

export interface CandidateCondition {
  id: string;
  label: string;
  dept: string;
  score: number;
  otcHints: string[];
}

export interface StructuredDiagnosis {
  triage: TriageLevel;
  explanations: { name: string; why: string; likelihood: number }[];
  otc_suggestions: string[];
  recommended_department: string;
  return_precautions: string[];
  disclaimer: string;
}

export interface AiDiagnosisResult {
  triage: TriageLevel;
  structured: StructuredDiagnosis | null;
  summary: string;
  raw: string;
  model: string;
}

export interface CallAiDiagnosisOptions {
  intake: Intake;
  candidates: CandidateCondition[];
  apiKey: string;
  model?: string;
}

export function buildDiagnosisPrompt(intake: Intake, candidates: CandidateCondition[]): string {
  return `You are a careful health education and triage assistant.
- NEVER make definitive diagnoses or prescribe exact dosages.
- Use conditional language such as "could be" or "might relate to".
- Recommend care levels as one of: home, primary care (pcp), urgent care, emergent.
- Provide approachable, calm language and include caveats for allergies, pregnancy, and pediatrics when relevant.
- Refer to departments exactly as provided in the candidate list when suggesting where to seek care.
- Always finish with: "This is for education only and not a medical diagnosis."

Patient intake:
${JSON.stringify(intake, null, 2)}

Candidate conditions with relative likelihood scores (0..1):
${JSON.stringify(candidates, null, 2)}

Return JSON ONLY in the format:
{
  "triage": "home" | "pcp" | "urgent" | "emergent",
  "explanations": [{"name": string, "why": string, "likelihood": number}],
  "otc_suggestions": string[],
  "recommended_department": string,
  "return_precautions": string[],
  "disclaimer": string
}
Then after the JSON, output a patient-friendly summary between <<<TEXT>>> and <<<END>>>.
`;
}

function parseStructuredJson(
  text: string,
): { triage: TriageLevel | null; structured: StructuredDiagnosis | null } {
  const jsonMatch = text.match(/\{[\s\S]*?\}\s*(?=<<<TEXT>>>)/);
  if (!jsonMatch) {
    return { triage: null, structured: null };
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as Partial<StructuredDiagnosis> & { triage?: string };
    if (!parsed || typeof parsed !== "object") {
      return { triage: null, structured: null };
    }

    const triage =
      parsed.triage && TRIAGE_LEVELS.includes(parsed.triage as TriageLevel)
        ? (parsed.triage as TriageLevel)
        : null;

    if (!triage) {
      return { triage: null, structured: null };
    }

    const explanations = Array.isArray(parsed.explanations) ? parsed.explanations : [];
    const otcSuggestions = Array.isArray(parsed.otc_suggestions) ? parsed.otc_suggestions : [];
    const returnPrecautions = Array.isArray(parsed.return_precautions)
      ? parsed.return_precautions
      : [];

    return {
      triage,
      structured: {
        triage,
        explanations,
        otc_suggestions: otcSuggestions,
        recommended_department: parsed.recommended_department ?? "",
        return_precautions: returnPrecautions,
        disclaimer: parsed.disclaimer ?? "This is for education only and not a medical diagnosis.",
      },
    };
  } catch {
    return { triage: null, structured: null };
  }
}

function extractSummary(text: string): string | null {
  const summaryMatch = text.match(/<<<TEXT>>>([\s\S]*?)<<<END>>>/);
  if (!summaryMatch) {
    return null;
  }
  return summaryMatch[1].trim();
}

export function parseAiDiagnosis(text: string): AiDiagnosisResult {
  const { triage, structured } = parseStructuredJson(text);
  const summary = extractSummary(text) ?? text.trim();

  return {
    triage: triage ?? "pcp",
    structured,
    summary,
    raw: text,
    model: "",
  };
}

export async function callAiDiagnosis({
  intake,
  candidates,
  apiKey,
  model,
}: CallAiDiagnosisOptions): Promise<AiDiagnosisResult> {
  const prompt = buildDiagnosisPrompt(intake, candidates);
  const modelsToTry = buildModelPreferenceList(model);

  const client = new GoogleGenerativeAI(apiKey);
  let lastError: unknown;

  for (let index = 0; index < modelsToTry.length; index += 1) {
    const currentModel = modelsToTry[index];
    try {
      const gemini = client.getGenerativeModel({ model: currentModel });
      const result = await gemini.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      });

      const fullText = result.response.text() ?? "";
      const parsed = parseAiDiagnosis(fullText);
      return { ...parsed, model: currentModel };
    } catch (error) {
      lastError = error;
      const hasMore = index < modelsToTry.length - 1;
      if (!hasMore || !isModelSelectionError(error)) {
        throw error;
      }
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }

  throw new Error("Unable to obtain AI-assisted diagnosis.");
}

function buildModelPreferenceList(requested?: string | null): string[] {
  if (!requested) {
    return [...DEFAULT_MODEL_CANDIDATES];
  }

  const trimmed = requested.trim();
  if (!trimmed) {
    return [...DEFAULT_MODEL_CANDIDATES];
  }

  const candidates = new Set<string>();
  candidates.add(trimmed);
  for (const fallback of DEFAULT_MODEL_CANDIDATES) {
    candidates.add(fallback);
  }
  return Array.from(candidates);
}

function isModelSelectionError(error: unknown): boolean {
  if (!error) return false;
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : String(error);
  const normalized = message.toLowerCase();

  return (
    normalized.includes("404") ||
    normalized.includes("not found") ||
    normalized.includes("not supported for generatecontent") ||
    normalized.includes("unsupported") ||
    normalized.includes("not enabled for generatecontent")
  );
}
