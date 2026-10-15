import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineTool } from '@copilotkit/runtime/v2';
import { z } from 'zod';

export function getSkillsRoot(): string {
  if (process.env.SKILLS_PATH) return process.env.SKILLS_PATH;
  if (process.env.SKILLS_DIR) return process.env.SKILLS_DIR;
  if (process.env.OPENDOTS_SKILLS_PATH) return process.env.OPENDOTS_SKILLS_PATH;
  if (process.env.GALAXYONE_SKILLS_PATH)
    return process.env.GALAXYONE_SKILLS_PATH;
  const standardPaths = [
    path.resolve(process.cwd(), 'skills'),
    fileURLToPath(new URL('../../skills', import.meta.url)),
    'C:\\Users\\jmoor\\Projects\\GalaxyOne\\skills',
    path.resolve(process.cwd(), '../GalaxyOne/skills'),
  ];
  for (const p of standardPaths) {
    if (fs.existsSync(p)) return p;
  }
  return standardPaths[0];
}

export const SKILLS_ROOT = getSkillsRoot();

export interface SkillInfo {
  name: string;
  description: string;
  directory?: string;
}

export function getAvailableSkills(additional: SkillInfo[] = []): SkillInfo[] {
  try {
    const root = getSkillsRoot();
    if (!fs.existsSync(root)) return additional;
    const entries = fs.readdirSync(root, { withFileTypes: true });
    const skills: SkillInfo[] = [];
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        const skillMd = path.join(root, entry.name, 'SKILL.md');
        if (!fs.existsSync(skillMd)) continue;
        let description = '';
        if (fs.existsSync(skillMd)) {
          const content = fs.readFileSync(skillMd, 'utf-8');
          const match = content.match(/description:\s*([^\n\r]+)/i);
          if (match) description = match[1].trim();
        }
        skills.push({
          name: entry.name,
          description,
          directory: path.join(root, entry.name),
        });
      }
    }
    return [...skills, ...additional];
  } catch {
    return additional;
  }
}

export function readSkillContent(
  skillName: string,
  relativePath = 'SKILL.md',
  additional: SkillInfo[] = [],
): string {
  try {
    const skill = getAvailableSkills(additional).find(
      (s) => s.name === skillName,
    );
    if (!skill?.directory) return `Skill not available: ${skillName}`;
    if (
      path.isAbsolute(relativePath) ||
      relativePath.split(/[\\/]/).includes('..')
    )
      return 'Skill file must stay inside its skill folder.';
    const root = fs.realpathSync(skill.directory);
    const fullPath = fs.realpathSync(
      path.resolve(root, relativePath || 'SKILL.md'),
    );
    const relative = path.relative(root, fullPath);
    if (relative.startsWith('..') || path.isAbsolute(relative))
      return 'Skill file must stay inside its skill folder.';
    if (fs.statSync(fullPath).size > 5_000_000)
      return 'Skill file exceeds the size limit.';
    if (!fs.existsSync(fullPath)) {
      return `Skill file not found: ${skillName}/${relativePath}`;
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
export function matchAndLoadRelevantSkills(
  userText: string,
  maxSkills = 2,
  additional: SkillInfo[] = [],
): string {
  const all = getAvailableSkills(additional);
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
    if (q.includes('sims') && (n.includes('sims') || d.includes('sims')))
      score += 10;
    if (q.includes('mod') && (n.includes('mod') || d.includes('mod')))
      score += 6;
    if (
      q.includes('reverse') &&
      (n.includes('reverse') || d.includes('reverse'))
    )
      score += 12;
    if (
      q.includes('protobuf') &&
      (n.includes('reverse') ||
        n.includes('sims4') ||
        n.includes('architecture'))
    )
      score += 8;
    if (q.includes('tuning') && (n.includes('tuning') || d.includes('tuning')))
      score += 10;
    if (
      q.includes('script') &&
      (n.includes('script') || d.includes('script') || n.includes('ts4'))
    )
      score += 10;
    if (
      q.includes('package') &&
      (n.includes('package') || d.includes('package'))
    )
      score += 8;
    if (q.includes('crash') || q.includes('bug') || q.includes('diagnos')) {
      if (n.includes('diagnos') || d.includes('diagnos') || n.includes('bug'))
        score += 8;
    }

    // Default boost for core Sims 4 skills if Sims is mentioned anywhere
    if (q.includes('sims') && n === 'sims4-mod-reverse-engineering') score += 5;
    if (q.includes('sims') && n === 'sims-4') score += 4;

    return { ...s, score };
  });

  const top = scored
    .filter((s) => s.score > 4)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSkills);

  if (!top.length) return '';

  const blocks = top.map((s) => {
    const content = readSkillContent(s.name, 'SKILL.md', additional);
    return `### ACTIVATED SKILL: ${s.name}\n${content.slice(0, 2500)}\n`;
  });

  return `\n\n=== AUTONOMOUSLY ACTIVATED PROJECT SKILL ===\nFollow the exact protocols and standards of this loaded skill from GalaxyOne:\n\n${blocks.join('\n\n')}\n=== END ACTIVATED SKILL ===\n`;
}

export function getCompactSkillCatalog(): string {
  const all = getAvailableSkills();
  if (!all.length) return '';
  const lines = all.map(
    (s) => `- **${s.name}**: ${s.description.slice(0, 100)}`,
  );
  return `\n\n### FULL PROJECT SKILL CATALOG (${all.length} Skills Available):\n${lines.join('\n')}\nUse read_skill(skill_name) if you need additional specialized guidelines during execution.`;
}

export function skillsTools(
  check: () => void,
  additional: () => SkillInfo[] = () => [],
) {
  return [
    defineTool({
      name: 'list_skills',
      description:
        'List standalone skills and enabled plugin skills assigned to this Dot.',
      parameters: z.object({
        filter: z
          .string()
          .optional()
          .describe('Keyword to filter skill names, e.g. "sims" or "reverse"'),
      }),
      execute: async ({ filter }) => {
        check();
        const all = getAvailableSkills(additional());
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
          .describe(
            'Name of the skill to read, e.g. "sims4-mod-reverse-engineering"',
          ),
        file: z
          .string()
          .optional()
          .describe('Optional subfile within skill, defaults to "SKILL.md"'),
      }),
      execute: async ({ skill_name, file }) => {
        check();
        const content = readSkillContent(skill_name, file, additional());
        return {
          skill: skill_name,
          content: content.slice(0, 16000),
        };
      },
    }),
  ];
}
