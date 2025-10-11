"use client";

import { FormEvent, useMemo, useState } from "react";

type Sex = "male" | "female" | "other" | "unknown";

type ApiResponse =
  | {
      triage: "emergent";
      message: string;
      disclaimer: string;
    }
  | {
      triage: "home" | "pcp" | "urgent" | "emergent";
      structured: {
        triage: string;
        explanations: { name: string; why: string; likelihood: number }[];
        otc_suggestions: string[];
        recommended_department: string;
        return_precautions: string[];
        disclaimer: string;
      } | null;
      summary: string;
    };

const QUICK_SYMPTOMS = [
  "sore throat",
  "fever",
  "runny nose",
  "cough",
  "nausea",
  "light sensitivity",
  "lower back pain",
  "painful urination",
  "high fever",
];

export default function HomePage() {
  const [age, setAge] = useState(30);
  const [heightCm, setHeightCm] = useState<number | "">(170);
  const [weightKg, setWeightKg] = useState<number | "">(65);
  const [sex, setSex] = useState<Sex>("unknown");
  const [durationDays, setDurationDays] = useState<number | "">(3);
  const [chiefComplaint, setChiefComplaint] = useState("sore throat and fever");
  const [symptomInput, setSymptomInput] = useState("sore throat, runny nose, cough");
  const [riskFactors, setRiskFactors] = useState("smoker");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<ApiResponse | null>(null);

  const symptomList = useMemo(
    () =>
      symptomInput
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    [symptomInput],
  );

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setResponse(null);

    try {
      const res = await fetch("/api/diagnose", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          age: typeof age === "number" ? age : Number(age),
          heightCm: heightCm === "" ? undefined : Number(heightCm),
          weightKg: weightKg === "" ? undefined : Number(weightKg),
          sex,
          durationDays: durationDays === "" ? undefined : Number(durationDays),
          chiefComplaint,
          symptoms: symptomList,
          riskFactors: riskFactors
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
        }),
      });

      if (!res.ok) {
        const payload = await res.json();
        throw new Error(payload.error ? JSON.stringify(payload.error) : res.statusText);
      }

      const payload: ApiResponse = await res.json();
      setResponse(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  function toggleSymptom(symptom: string) {
    setSymptomInput((prev) => {
      const current = prev
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      if (current.includes(symptom)) {
        return current.filter((item) => item !== symptom).join(", ");
      }
      return [...current, symptom].join(", ");
    });
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-10 space-y-8">
      <header className="space-y-2 text-center">
        <p className="text-sm uppercase tracking-widest text-sky-600">DiseaseDetect</p>
        <h1 className="text-3xl font-bold">LLM-assisted symptom triage</h1>
        <p className="text-slate-600">
          输入基础信息和症状，系统将结合启发式规则和 Gemini AI 生成教育用途的分诊建议。
        </p>
      </header>

      <section className="card">
        <form className="space-y-6" onSubmit={onSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              <span>Age</span>
              <input
                type="number"
                min={0}
                max={120}
                value={age}
                onChange={(event) => setAge(Number(event.target.value))}
                required
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span>Sex</span>
              <select value={sex} onChange={(event) => setSex(event.target.value as Sex)}>
                <option value="unknown">Prefer not to say</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span>Height (cm)</span>
              <input
                type="number"
                min={80}
                max={260}
                value={heightCm}
                onChange={(event) => setHeightCm(event.target.value === "" ? "" : Number(event.target.value))}
                placeholder="可选"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span>Weight (kg)</span>
              <input
                type="number"
                min={20}
                max={350}
                value={weightKg}
                onChange={(event) => setWeightKg(event.target.value === "" ? "" : Number(event.target.value))}
                placeholder="可选"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span>Symptom duration (days)</span>
              <input
                type="number"
                min={0}
                max={365}
                value={durationDays}
                onChange={(event) => setDurationDays(event.target.value === "" ? "" : Number(event.target.value))}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span>Risk factors (comma separated)</span>
              <input
                type="text"
                value={riskFactors}
                onChange={(event) => setRiskFactors(event.target.value)}
                placeholder="如 smoker, pregnancy"
              />
            </label>
          </div>

          <label className="flex flex-col gap-1 text-sm">
            <span>Chief complaint</span>
            <input
              type="text"
              value={chiefComplaint}
              onChange={(event) => setChiefComplaint(event.target.value)}
              placeholder="例如 sore throat and fever"
              required
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span>Symptoms (comma separated)</span>
            <textarea
              value={symptomInput}
              onChange={(event) => setSymptomInput(event.target.value)}
              rows={3}
            />
          </label>

          <div className="flex flex-wrap gap-2 text-sm">
            {QUICK_SYMPTOMS.map((symptom) => {
              const isActive = symptomList.includes(symptom);
              return (
                <button
                  type="button"
                  key={symptom}
                  onClick={() => toggleSymptom(symptom)}
                  className={`rounded-full border px-3 py-1 transition ${
                    isActive ? "border-sky-600 bg-sky-50 text-sky-700" : "border-slate-300 bg-white"
                  }`}
                >
                  {symptom}
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between gap-4">
            <p className="text-xs text-slate-500">
              数据仅用于实时推理，不会存储。AI 输出仅供参考，请务必结合专业医生建议。
            </p>
            <button type="submit" className="primary px-4 py-2" disabled={loading}>
              {loading ? "Assessing..." : "Assess now"}
            </button>
          </div>
        </form>
      </section>

      {error && (
        <section className="card border-red-200 bg-red-50 text-sm text-red-800">
          <p>Request failed: {error}</p>
        </section>
      )}

      {response && response.triage === "emergent" && "message" in response ? (
        <section className="card border-red-300 bg-red-50">
          <h2 className="text-lg font-semibold text-red-700">Possible emergency</h2>
          <p>{response.message}</p>
          <p className="text-xs text-red-600">This is for education only and not a medical diagnosis.</p>
        </section>
      ) : null}

      {response && "structured" in response && response.structured && (
        <section className="card">
          <header className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Structured triage insight</h2>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs uppercase tracking-wide text-slate-600">
              {response.structured.triage}
            </span>
          </header>
          <div className="space-y-3 text-sm">
            <div>
              <h3 className="font-medium text-slate-700">Top considerations</h3>
              <ul className="mt-2 space-y-2">
                {response.structured.explanations.map((item) => (
                  <li key={item.name} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="flex items-center justify-between font-semibold text-slate-800">
                      <span>{item.name}</span>
                      <span className="text-xs text-slate-500">likelihood {item.likelihood}</span>
                    </p>
                    <p className="mt-1 text-slate-600">{item.why}</p>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="font-medium text-slate-700">Recommended department</h3>
              <p className="text-slate-600">{response.structured.recommended_department}</p>
            </div>
            {response.structured.otc_suggestions.length > 0 && (
              <div>
                <h3 className="font-medium text-slate-700">OTC categories to discuss</h3>
                <ul className="list-disc pl-5 text-slate-600">
                  {response.structured.otc_suggestions.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
            {response.structured.return_precautions.length > 0 && (
              <div>
                <h3 className="font-medium text-slate-700">Return precautions</h3>
                <ul className="list-disc pl-5 text-slate-600">
                  {response.structured.return_precautions.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-xs text-slate-500">{response.structured.disclaimer}</p>
          </div>
        </section>
      )}

      {response && "summary" in response && response.summary && (
        <section className="card">
          <h2 className="text-lg font-semibold">Patient-friendly summary</h2>
          <p className="whitespace-pre-wrap text-sm text-slate-700">{response.summary}</p>
        </section>
      )}
    </main>
  );
}
