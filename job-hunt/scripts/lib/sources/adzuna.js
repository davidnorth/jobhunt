const BASE = "https://api.adzuna.com/v1/api/jobs/gb/search";

export async function searchAdzuna({ term, location }) {
  const appId = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;

  if (!appId || !appKey) {
    throw new Error("ADZUNA_APP_ID and ADZUNA_APP_KEY must be set");
  }

  const params = new URLSearchParams({
    app_id: appId,
    app_key: appKey,
    results_per_page: "20",
    what: term,
  });

  // Only add location if it's not "remote" — Adzuna handles remote via what field better
  const loc = (location || "").toLowerCase();
  if (loc && loc !== "remote") {
    params.set("where", location);
  } else {
    params.set("what", `${term} remote`);
  }

  const url = `${BASE}/1?${params}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[adzuna] HTTP ${res.status} for "${term}": ${body}`);
      return [];
    }
    const data = await res.json();
    return (data.results || []).map(normalise);
  } catch (err) {
    console.error(`[adzuna] Error searching "${term}":`, err.message);
    return [];
  }
}

function normalise(r) {
  const salaryParts = [];
  if (r.salary_min) salaryParts.push(`£${Math.round(r.salary_min / 1000)}k`);
  if (r.salary_max && r.salary_max !== r.salary_min) salaryParts.push(`£${Math.round(r.salary_max / 1000)}k`);
  const salaryStr = salaryParts.join("–");

  const metaParts = [];
  if (salaryStr) metaParts.push(salaryStr);
  if (r.contract_type) metaParts.push(r.contract_type);
  if (r.contract_time) metaParts.push(r.contract_time);
  if (r.category?.label) metaParts.push(r.category.label);

  return {
    source: "adzuna",
    sourceId: String(r.id || ""),
    title: r.title || "",
    company: r.company?.display_name || "(unknown)",
    location: r.location?.display_name || "",
    description: r.description || "",
    snippet: metaParts.join(" · "),
    url: r.redirect_url || "",
  };
}
