import OpenAI from "openai";
import { isJobSeen } from "./store.js";
import { searchAdzuna } from "./sources/adzuna.js";

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY || "",
  baseURL: "https://api.deepseek.com",
});

export async function runDiscovery() {
  const { buildProfile } = await import("./profile.js");
  const { createRun, completeRun, failRun, insertJob } = await import("./store.js");

  const runId = createRun();
  console.log(`[job-hunt] Starting run #${runId}`);

  try {
    const profile = await buildProfile();
    console.log(`[job-hunt] Profile built: ${profile.skills.length} skills, ${profile.experience.length} roles`);

    const rawJobs = await discoverJobs(profile);
    console.log(`[job-hunt] Found ${rawJobs.length} raw jobs`);

    let scored = 0;
    for (const job of rawJobs) {
      if (isJobSeen(job.source, job.sourceId, job.title, job.company)) {
        continue;
      }
      try {
        const result = await scoreJob(profile, job);
        insertJob({
          ...job,
          runId,
          ...result,
        });
        scored++;
        console.log(`[job-hunt] Scored: ${job.title} at ${job.company} → ${result.score}/100`);
      } catch (err) {
        console.error(`[job-hunt] Scoring failed for ${job.title}:`, err.message);
      }
    }

    completeRun(runId, { jobsFound: rawJobs.length, jobsScored: scored });
    console.log(`[job-hunt] Run #${runId} complete: ${scored} scored out of ${rawJobs.length} found`);
    return { runId, found: rawJobs.length, scored };
  } catch (err) {
    failRun(runId, err);
    console.error(`[job-hunt] Run #${runId} failed:`, err);
    throw err;
  }
}

async function discoverJobs(profile) {
  const terms = profile.searchTerms || [];
  if (terms.length === 0) {
    console.warn("[job-hunt] No search terms in profile — nothing to search");
    return [];
  }

  const location = profile.preferences?.location?.preference || "Remote";
  console.log(`[job-hunt] Searching Adzuna with ${terms.length} terms (location: ${location})`);

  const allJobs = [];
  const seen = new Set();

  for (const term of terms) {
    console.log(`[job-hunt]   Searching: "${term}" in "${location}"`);
    const jobs = await searchAdzuna({ term, location });
    for (const job of jobs) {
      const key = `${job.title}|${job.company}`;
      if (!seen.has(key)) {
        seen.add(key);
        allJobs.push(job);
      }
    }
    console.log(`[job-hunt]   → ${jobs.length} results for "${term}"`);
  }

  console.log(`[job-hunt] Total unique jobs across all searches: ${allJobs.length}`);
  return allJobs;
}

export async function scoreJob(profile, job) {
  const prompt = buildScorePrompt(profile, job);

  const response = await client.chat.completions.create({
    model: "deepseek-chat",
    messages: [
      {
        role: "system",
        content:
          "You are a precise job fit evaluator. Score how well the candidate matches the job. Always respond with valid JSON only, no other text.",
      },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
    temperature: 0.2,
    max_tokens: 1000,
  });

  const text = response.choices[0].message.content;
  const result = JSON.parse(text);

  return {
    score: clampScore(result.score),
    reasoning: result.reasoning || "",
    strengths: result.strengths || [],
    gaps: result.gaps || [],
    recommendation: result.recommendation || "consider",
  };
}

function buildScorePrompt(profile, job) {
  const profileJson = {
    name: profile.name,
    title: profile.title,
    skills: profile.skills.slice(0, 30),
    experience: profile.experience.map((e) => ({
      company: e.company,
      role: e.role,
      period: e.period,
      description: e.description.slice(0, 500),
    })),
    summary: profile.summary?.slice(0, 500) || "",
    preferences: profile.preferences,
  };

  return `Candidate Profile:
\`\`\`json
${JSON.stringify(profileJson, null, 2)}
\`\`\`

The candidate's stated preferences and dealbreakers:
${profile.knowledgeRaw?.slice(0, 2000) || profile.preferences?.dealbreakers?.join("; ") || "None specified"}

Job Listing:
Title: ${job.title}
Company: ${job.company}
Location: ${job.location || "Not specified"}
${job.description ? `Description: ${job.description.slice(0, 3000)}` : ""}
${job.snippet ? `Metadata snippet: ${job.snippet}` : ""}

Evaluate how well this JOB suits the CANDIDATE (not the other way around). The candidate is being selective — they are not desperate. Focus on whether this role would satisfy the candidate's preferences, values, and career goals.

Consider especially:
- Does it match desired role types and seniority level?
- Does location match their preference (remote, hybrid, UK timezone)?
- Is the company in a preferred industry? Is it in an explicitly avoided industry?
- Does the title/company suggest the kind of autonomy and impact they value?
- Would this role use their core skills (JavaScript/TypeScript/React, Ruby on Rails, leadership)?

IMPORTANT: Dealbreakers from the profile are HARD PASSES. If any dealbreaker is triggered, score must be 0-20 regardless of other factors.

Return a JSON object with these fields:
- score: integer 0-100 (0 = actively bad fit, 50 = neutral, 100 = ideal role for this candidate)
- reasoning: 2-4 sentence explanation focused on why this job would or wouldn't work for THEM
- strengths: array of strings — what aspects of this job align with what the candidate WANTS
- gaps: array of strings — what aspects of this job fail to meet the candidate's preferences or values
- recommendation: one of "apply" (strong fit for the candidate), "consider" (worth a look), "skip" (not a good match for what they want)`;
}

function clampScore(score) {
  const n = Number(score);
  if (isNaN(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
}
