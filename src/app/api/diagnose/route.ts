import { NextResponse } from "next/server";
import { z } from "zod";
import { isLocalRedFlag, RULES, scoreConditions } from "@/lib/rules";
import type { Intake } from "@/lib/schema";
import { callAiDiagnosis, CandidateCondition } from "@/lib/ai-diagnosis";

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

export async function POST(request: Request) {
  const apiKey = process.env.GOOGLE_GENAI_API_KEY;
  if (!apiKey) {
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
  const candidates: CandidateCondition[] = ranked.map((entry) => {
    const rule = RULES.find((r) => r.id === entry.id)!;
    return {
      id: rule.id,
      label: rule.label,
      dept: rule.dept,
      score: entry.score,
      otcHints: rule.otcHints ?? [],
    };
  });

  try {
    const modelOverride = process.env.GOOGLE_GENAI_MODEL?.trim() || undefined;
    const aiResult = await callAiDiagnosis({
      intake,
      candidates,
      apiKey,
      model: modelOverride,
    });

    return NextResponse.json({
      triage: aiResult.triage,
      structured: aiResult.structured,
      summary: aiResult.summary,
      model: aiResult.model,
    });
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Unable to obtain AI-assisted diagnosis.";

    return NextResponse.json({
      error: message,
    }, { status: 502 });
  }
}
