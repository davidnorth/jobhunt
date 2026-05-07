import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { existsSync } from "node:fs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const CV_CONTENT = path.resolve(ROOT, "../cv-builder/content");
const KNOWLEDGE_DIR = path.resolve(ROOT, "knowledge");

export async function buildProfile() {
  const [cvData, knowledgeData] = await Promise.all([
    readAllCvFiles(CV_CONTENT),
    readAllKnowledgeFiles(KNOWLEDGE_DIR),
  ]);

  const allSkills = new Set();
  const allExperience = [];

  for (const cv of cvData) {
    for (const skill of cv.skills) allSkills.add(skill);
    for (const exp of cv.experience) {
      if (!allExperience.some((e) => e.company === exp.company && e.role === exp.role)) {
        allExperience.push(exp);
      }
    }
  }

  const preferences = extractPreferences(knowledgeData);

  const knowledgeText = knowledgeData.map((k) => k.content).join("\n\n");
  const summary = cvData.map((c) => c.summary).filter(Boolean).join(" ");

  const searchTerms = deriveSearchTerms(preferences.desiredRoles, [...allSkills]);

  return {
    name: cvData[0]?.name || "",
    title: cvData[0]?.title || "",
    contact: cvData[0]?.contact || [],
    summary,
    skills: [...allSkills],
    experience: allExperience,
    preferences,
    knowledgeRaw: knowledgeText,
    searchTerms,
  };
}

async function readAllCvFiles(dir) {
  if (!existsSync(dir)) return [];

  const files = await readdir(dir);
  const mdFiles = files.filter((f) => f.endsWith(".md"));

  const results = await Promise.all(
    mdFiles.map(async (file) => {
      const raw = await readFile(path.join(dir, file), "utf8");
      const { data, content } = matter(raw);
      return parseCvFrontmatter(data, content);
    })
  );

  return results;
}

function parseCvFrontmatter(data, content) {
  const skills = [];
  const experience = [];
  let contact = data.contact || [];

  for (const section of data.sections || []) {
    if (section.type === "skills") {
      for (const item of section.items || []) skills.push(item);
    }
    if (section.type === "experience") {
      for (const item of section.items || []) {
        experience.push({
          company: item.company || "",
          role: item.role || "",
          period: item.period || "",
          description: String(item.description || "").trim(),
        });
      }
    }
  }

  return {
    name: data.name || "",
    title: data.title || "",
    contact: Array.isArray(contact) ? contact : [String(contact)],
    summary: content.trim(),
    skills,
    experience,
  };
}

async function readAllKnowledgeFiles(dir) {
  if (!existsSync(dir)) return [];

  const files = await readdir(dir);
  const mdFiles = files.filter((f) => f.endsWith(".md"));

  const results = await Promise.all(
    mdFiles.map(async (file) => {
      const raw = await readFile(path.join(dir, file), "utf8");
      const { data, content } = matter(raw);
      return { file, data, content: content.trim() };
    })
  );

  return results;
}

function extractPreferences(knowledgeData) {
  const prefs = {};
  for (const k of knowledgeData) {
    for (const [key, value] of Object.entries(k.data)) {
      if (value !== undefined && value !== null && key !== "sections") {
        prefs[key] = value;
      }
    }
  }
  return prefs;
}

function deriveSearchTerms(desiredRoles, skills) {
  const terms = [];

  if (desiredRoles && Array.isArray(desiredRoles)) {
    terms.push(...desiredRoles);
  }

  const coreSkills = [
    "React", "Ruby on Rails", "Node.js", "TypeScript", "JavaScript",
    "Engineering Manager", "VP Engineering", "Staff Engineer", "Full Stack",
  ];
  const relevant = coreSkills.filter((s) => skills.includes(s));
  if (relevant.length > 0) {
    terms.push(...relevant.filter((t) => !terms.includes(t)));
  }

  if (terms.length === 0) {
    terms.push("Senior Software Engineer");
  }

  return [...new Set(terms)];
}
