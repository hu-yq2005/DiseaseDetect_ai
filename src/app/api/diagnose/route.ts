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

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENAI_API_KEY || "");

const TRIAGE_LEVELS = ["home", "pcp", "urgent", "emergent"] as const;

type TriageLevel = (typeof TRIAGE_LEVELS)[number];

export async function POST(request: Request) {
  if (!process.env.GOOGLE_GENAI_API_KEY) {
    return NextResponse.json({
      error: "GOOGLE_GENAI_API_KEY is not configured.",
    }, { status: 500 });
  }

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
      disclaimer: "Educational use only. Not a medical diagnosis.",
    });
  }

  const ranked = scoreConditions(intake);
  const candidates = ranked.map((entry) => {
    const rule = RULES.find((r) => r.id === entry.id)!;
    return {
      id: rule.id,
      label: rule.label,
      dept: rule.dept,
      score: entry.score,
      otcHints: rule.otcHints ?? [],
    };
  });

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
  let parsedLLM: {
    triage: TriageLevel;
    explanations: { name: string; why: string; likelihood: number }[];
    otc_suggestions: string[];
    recommended_department: string;
    return_precautions: string[];
    disclaimer: string;
  } | null = null;

  if (jsonMatch) {
    try {
      parsedLLM = JSON.parse(jsonMatch[0]);
    } catch (error) {
      parsedLLM = null;
    }
  }

  const summaryMatch = fullText.match(/<<<TEXT>>>([\s\S]*?)<<<END>>>/);

  return NextResponse.json({
    triage: parsedLLM?.triage ?? "pcp",
    structured: parsedLLM,
    summary: summaryMatch ? summaryMatch[1].trim() : fullText,
  });
}
