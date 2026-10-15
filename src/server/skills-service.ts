import * as fs from 'node:fs';
import * as path from 'node:path';
import { defineTool } from '@copilotkit/runtime/v2';
import { z } from 'zod';

export const SKILLS_ROOT = 'C:\\Users\\jmoor\\Projects\\GalaxyOne\\skills';

export interface SkillInfo {
  name: string;
  description: string;
}

let cachedSkills: SkillInfo[] | null = null;

export function getAvailableSkills(): SkillInfo[] {
  if (cachedSkills) return cachedSkills;
  try {
    if (!fs.existsSync(SKILLS_ROOT)) return [];
    const entries = fs.readdirSync(SKILLS_ROOT, { withFileTypes: true });
    const skills: SkillInfo[] = [];
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        const skillMd = path.join(SKILLS_ROOT, entry.name, 'SKILL.md');
        let description = '';
        if (fs.existsSync(skillMd)) {
          const content = fs.readFileSync(skillMd, 'utf-8');
          const match = content.match(/description:\s*([^\n\r]+)/i);
          if (match) description = match[1].trim();
        }
        skills.push({ name: entry.name, description });
      }
    }
    cachedSkills = skills;
    return skills;
  } catch {
    return [];
  }
}

export function readSkillContent(skillName: string, relativePath = 'SKILL.md'): string {
  try {
    const cleanName = path.basename(skillName);
    const targetFile = relativePath ? relativePath.replace(/^(\/|\\)+/, '') : 'SKILL.md';
    const fullPath = path.join(SKILLS_ROOT, cleanName, targetFile);
    if (!fs.existsSync(fullPath)) {
      return `Skill file not found: ${cleanName}/${targetFile}`;
    }
    return fs.readFileSync(fullPath, 'utf-8');
  } catch (err: any) {
    return `Error reading skill: ${err.message}`;
  }
}

/**
 * Autonomously selects the most relevant skills based on user prompt and domain keywords.
 * Returns the full instructions of the top matched skills to inject directly into context.
 */
export function matchAndLoadRelevantSkills(userText: string, maxSkills = 2): string {
  const all = getAvailableSkills();
  if (!all.length) return '';

  const q = (userText || '').toLowerCase();
  const words = q.split(/[\s,._-]+/).filter((w) => w.length > 2);

  const scored = all.map((s) => {
    let score = 0;
    const n = s.name.toLowerCase();
    const d = s.description.toLowerCase();

    for (const w of words) {
      if (n.includes(w)) score += 5;
      if (d.includes(w)) score += 2;
    }
    if (q.includes('sims') && (n.includes('sims') || d.includes('sims'))) score += 10;
    if (q.includes('mod') && (n.includes('mod') || d.includes('mod'))) score += 6;
    if (q.includes('reverse') && (n.includes('reverse') || d.includes('reverse'))) score += 12;
    if (q.includes('protobuf') && (n.includes('reverse') || n.includes('sims4') || n.includes('architecture'))) score += 8;
    if (q.includes('tuning') && (n.includes('tuning') || d.includes('tuning'))) score += 10;
    if (q.includes('script') && (n.includes('script') || d.includes('script') || n.includes('ts4'))) score += 10;
    if (q.includes('package') && (n.includes('package') || d.includes('package'))) score += 8;
    if (q.includes('crash') || q.includes('bug') || q.includes('diagnos')) {
      if (n.includes('diagnos') || d.includes('diagnos') || n.includes('bug')) score += 8;
    }

    // Default boost for core Sims 4 skills if Sims is mentioned anywhere
    if (q.includes('sims') && n === 'sims4-mod-reverse-engineering') score += 5;
    if (q.includes('sims') && n === 'sims-4') score += 4;

    return { ...s, score };
  });

  const top = scored
    .filter((s) => s.score > 4)
    .sort((a, b) => b.score - a.score)
    .slice(0, 1);

  if (!top.length) return '';

  const blocks = top.map((s) => {
    const content = readSkillContent(s.name, 'SKILL.md');
    return `### ACTIVATED SKILL: ${s.name}\n${content.slice(0, 2500)}\n`;
  });

  return `\n\n=== AUTONOMOUSLY ACTIVATED PROJECT SKILL ===\nFollow the exact protocols and standards of this loaded skill from GalaxyOne:\n\n${blocks.join('\n\n')}\n=== END ACTIVATED SKILL ===\n`;
}

export function getCompactSkillCatalog(): string {
  const all = getAvailableSkills();
  if (!all.length) return '';
  const lines = all.map((s) => `- **${s.name}**: ${s.description.slice(0, 100)}`);
  return `\n\n### FULL PROJECT SKILL CATALOG (${all.length} Skills Available):\n${lines.join('\n')}\nUse read_skill(skill_name) if you need additional specialized guidelines during execution.`;
}

export function skillsTools(check: () => void) {
  return [
    defineTool({
      name: 'list_skills',
      description: 'List all local engineering and Sims 4 reverse-engineering skills available in GalaxyOne.',
      parameters: z.object({
        filter: z.string().optional().describe('Keyword to filter skill names, e.g. "sims" or "reverse"'),
      }),
      execute: async ({ filter }) => {
        check();
        const all = getAvailableSkills();
        const kw = (filter || '').toLowerCase();
        const filtered = kw
          ? all.filter(
              (s) =>
                s.name.toLowerCase().includes(kw) ||
                s.description.toLowerCase().includes(kw),
            )
          : all;
        return {
          total: filtered.length,
          skills: filtered.map((s) => ({
            name: s.name,
            description: s.description.slice(0, 160),
          })),
        };
      },
    }),
    defineTool({
      name: 'read_skill',
      description:
        'Read the full instructions and workflows for a skill (e.g. "sims4-mod-reverse-engineering", "sims4-ts4script-authoring", "sims-4").',
      parameters: z.object({
        skill_name: z
          .string()
          .describe('Name of the skill to read, e.g. "sims4-mod-reverse-engineering"'),
        file: z
          .string()
          .optional()
          .describe('Optional subfile within skill, defaults to "SKILL.md"'),
      }),
      execute: async ({ skill_name, file }) => {
        check();
        const content = readSkillContent(skill_name, file);
        return {
          skill: skill_name,
          content: content.slice(0, 16000),
        };
      },
    }),
  ];
}
