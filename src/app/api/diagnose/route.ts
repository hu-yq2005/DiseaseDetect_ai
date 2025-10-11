import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { isLocalRedFlag, RULES, scoreConditions } from "@/lib/rules";
import type { Intake } from "@/lib/schema";

const intakeSchema = z.object({
  age: z.number().int().min(0).max(120),
  heightCm: z.number().positive().max(260).optional(),
  weightKg: z.number().positive().max(350).optional(),
  sex: z.enum(["male", "female", "other", "unknown"]),
  durationDays: z.number().int().min(0).max(365).optional(),
  chiefComplaint: z.string().min(2),
  symptoms: z.array(z.string()).default([]),
  riskFactors: z.array(z.string()).optional(),
});

const apiKey = process.env.GOOGLE_GENAI_API_KEY;
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

const TRIAGE_LEVELS = ["home", "pcp", "urgent", "emergent"] as const;
const DEFAULT_DISCLAIMER = "Educational use only. Not a medical diagnosis.";

type TriageLevel = (typeof TRIAGE_LEVELS)[number];

type Candidate = {
  id: string;
  label: string;
  dept: string;
  score: number;
  otcHints: string[];
};

const llmStructuredSchema = z.object({
  triage: z.enum(TRIAGE_LEVELS),
  explanations: z
    .array(
      z.object({
        name: z.string(),
        why: z.string(),
        likelihood: z.number().min(0).max(1),
      }),
    )
    .default([]),
  otc_suggestions: z.array(z.string()).default([]),
  recommended_department: z.string(),
  return_precautions: z.array(z.string()).default([]),
  disclaimer: z.string().default(DEFAULT_DISCLAIMER),
});

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = intakeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const intake: Intake = parsed.data;

  if (isLocalRedFlag(intake)) {
    return NextResponse.json({
      triage: "emergent",
      message:
        "Your description includes potential red-flag symptoms. Please seek urgent medical attention or call emergency services immediately.",
      disclaimer: DEFAULT_DISCLAIMER,
    });
  }

  const ranked = scoreConditions(intake);
  const candidates: Candidate[] = ranked.map((entry) => {
    const rule = RULES.find((r) => r.id === entry.id)!;
    return {
      id: rule.id,
      label: rule.label,
      dept: rule.dept,
      score: entry.score,
      otcHints: rule.otcHints ?? [],
    };
  });

  const fallback = buildFallbackResponse(intake, candidates);

  if (!genAI) {
    return NextResponse.json(fallback);
  }

  const prompt = `You are a careful health education and triage assistant.
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

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
    const result = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
    });

    const fullText = result.response.text();
    const jsonMatch = fullText.match(/\{[\s\S]*?\}\s*(?=<<<TEXT>>>)/);
    let parsedLLM: z.infer<typeof llmStructuredSchema> | null = null;

    if (jsonMatch) {
        try {
          const candidateJSON = JSON.parse(jsonMatch[0]);
          const parsed = llmStructuredSchema.safeParse(candidateJSON);
          parsedLLM = parsed.success ? parsed.data : null;
        } catch (error) {
          parsedLLM = null;
        }
    }

    const summaryMatch = fullText.match(/<<<TEXT>>>([\s\S]*?)<<<END>>>/);

    if (parsedLLM) {
      return NextResponse.json({
        triage: parsedLLM.triage,
        structured: parsedLLM,
        summary: summaryMatch ? summaryMatch[1].trim() : fullText,
      });
    }

    return NextResponse.json({
      ...fallback,
      summary: summaryMatch ? summaryMatch[1].trim() : fallback.summary,
    });
  } catch (error) {
    console.error("Gemini request failed", error);
    return NextResponse.json(fallback);
  }
}

function buildFallbackResponse(intake: Intake, candidates: Candidate[]) {
  const [top, ...rest] = candidates;
  const text = (intake.chiefComplaint + " " + intake.symptoms.join(" ")).toLowerCase();

  const explanations = [top, ...rest]
    .filter(Boolean)
    .slice(0, 3)
    .map((candidate) => {
      const rule = RULES.find((item) => item.id === candidate.id);
      const matchedKeywords = rule
        ? Object.keys(rule.keywords).filter((keyword) => text.includes(keyword))
        : [];

      return {
        name: candidate.label,
        why:
          matchedKeywords.length > 0
            ? `Reported symptoms such as ${matchedKeywords.join(", ")} overlap with this condition's common presentation.`
            : "Heuristic symptom scoring suggested this as a possible consideration.",
        likelihood: Number(candidate.score.toFixed(2)),
      };
    });

  const recommendedDepartment = top?.dept ?? "Primary Care";
  const triage = inferTriageLevel(recommendedDepartment);

  const structured = {
    triage,
    explanations,
    otc_suggestions: top?.otcHints ?? [],
    recommended_department: recommendedDepartment,
    return_precautions: [
      "Seek urgent medical care if you develop new severe pain, trouble breathing, confusion, chest discomfort, or other red-flag symptoms.",
    ],
    disclaimer: DEFAULT_DISCLAIMER,
  };

  const summarySegments = [
    explanations.length
      ? `Top considerations include ${explanations
          .map((item) => `${item.name} (${Math.round(item.likelihood * 100)}% heuristic match)`).join(", "
        )}.`
      : "Symptoms did not strongly match any built-in condition heuristics.",
    `A reasonable next step is to follow up with ${recommendedDepartment}.`,
    "Monitor for any rapid worsening or red-flag changes and seek urgent care if they occur.",
    structured.disclaimer,
  ];

  return {
    triage,
    structured,
    summary: summarySegments.join("\n\n"),
  };
}

function inferTriageLevel(department: string): TriageLevel {
  const normalized = department.toLowerCase();
  if (normalized.includes("emerg")) {
    return "emergent";
  }
  if (normalized.includes("urgent")) {
    return "urgent";
  }
  if (normalized.includes("home")) {
    return "home";
  }
  return "pcp";
}
