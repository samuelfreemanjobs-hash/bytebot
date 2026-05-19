import { App, TFile, TFolder, Notice } from 'obsidian';
import { BytebotAPI } from './api';

export interface TemplatePattern {
  name: string;
  structure: string[];
  frontmatter: Record<string, string>;
  frequency: number;
}

export interface GeneratedTemplate {
  name: string;
  content: string;
  description: string;
}

export class TemplateGenerator {
  private app: App;
  private api: BytebotAPI;
  private templatesFolder: string;

  constructor(app: App, api: BytebotAPI, templatesFolder = 'Templates') {
    this.app = app;
    this.api = api;
    this.templatesFolder = templatesFolder;
  }

  async analyzeNotePatterns(): Promise<TemplatePattern[]> {
    const files = this.app.vault.getMarkdownFiles();
    const patterns: Map<string, TemplatePattern> = new Map();

    for (const file of files) {
      const content = await this.app.vault.read(file);
      const structure = this.extractStructure(content);
      const frontmatter = this.extractFrontmatter(content);
      const patternKey = structure.join('|');

      if (patterns.has(patternKey)) {
        const existing = patterns.get(patternKey)!;
        existing.frequency++;
      } else {
        patterns.set(patternKey, {
          name: this.generatePatternName(structure),
          structure,
          frontmatter,
          frequency: 1,
        });
      }
    }

    return Array.from(patterns.values())
      .filter((p) => p.frequency >= 2)
      .sort((a, b) => b.frequency - a.frequency);
  }

  private extractStructure(content: string): string[] {
    const lines = content.split('\n');
    const structure: string[] = [];

    for (const line of lines) {
      if (line.match(/^#{1,6}\s/)) {
        const level = line.match(/^#+/)![0].length;
        const heading = line.replace(/^#+\s*/, '').trim();
        structure.push(`${'#'.repeat(level)} ${this.normalizeHeading(heading)}`);
      }
    }

    return structure;
  }

  private normalizeHeading(heading: string): string {
    const commonHeadings: Record<string, string> = {
      summary: 'Summary',
      overview: 'Overview',
      introduction: 'Introduction',
      background: 'Background',
      notes: 'Notes',
      tasks: 'Tasks',
      'to do': 'Tasks',
      todos: 'Tasks',
      references: 'References',
      links: 'Links',
      resources: 'Resources',
      conclusion: 'Conclusion',
      'next steps': 'Next Steps',
      'action items': 'Action Items',
    };

    const lower = heading.toLowerCase();
    return commonHeadings[lower] || heading;
  }

  private extractFrontmatter(content: string): Record<string, string> {
    const frontmatter: Record<string, string> = {};

    if (content.startsWith('---')) {
      const endIndex = content.indexOf('---', 3);
      if (endIndex !== -1) {
        const fmContent = content.substring(3, endIndex);
        const lines = fmContent.split('\n');

        for (const line of lines) {
          const match = line.match(/^(\w+):\s*(.*)$/);
          if (match) {
            frontmatter[match[1]] = '{{' + match[1] + '}}';
          }
        }
      }
    }

    return frontmatter;
  }

  private generatePatternName(structure: string[]): string {
    if (structure.length === 0) return 'Basic Note';

    const firstHeading = structure[0].replace(/^#+\s*/, '');
    if (structure.some((s) => s.includes('Tasks'))) return 'Task Note';
    if (structure.some((s) => s.includes('Meeting'))) return 'Meeting Note';
    if (structure.some((s) => s.includes('Project'))) return 'Project Note';

    return `${firstHeading} Template`;
  }

  async generateTemplate(pattern: TemplatePattern): Promise<GeneratedTemplate> {
    let content = '';

    if (Object.keys(pattern.frontmatter).length > 0) {
      content += '---\n';
      for (const [key, value] of Object.entries(pattern.frontmatter)) {
        content += `${key}: ${value}\n`;
      }
      content += '---\n\n';
    }

    for (const heading of pattern.structure) {
      content += `${heading}\n\n`;
    }

    return {
      name: pattern.name,
      content,
      description: `Template with ${pattern.structure.length} sections, found in ${pattern.frequency} notes`,
    };
  }

  async generateTemplateWithAI(description: string): Promise<GeneratedTemplate> {
    const existingTemplates = await this.listTemplates();
    const existingList = existingTemplates.map((t) => t.basename).join(', ');

    const task = await this.api.createTask(
      `Create an Obsidian note template based on this description: "${description}"

Existing templates: ${existingList || 'none'}

Return the template in this exact format:
\`\`\`template
---
name: Template Name
description: Brief description
---
(template content here with {{placeholders}} for dynamic values)
\`\`\`

Use Obsidian-compatible markdown. Include relevant frontmatter fields.`,
    );

    return {
      name: description,
      content: `# ${description}\n\n## Notes\n\n`,
      description: 'AI-generated template - check Bytebot panel for result',
    };
  }

  async saveTemplate(template: GeneratedTemplate): Promise<TFile> {
    const folder = this.app.vault.getAbstractFileByPath(this.templatesFolder);
    if (!folder) {
      await this.app.vault.createFolder(this.templatesFolder);
    }

    const fileName = template.name.replace(/[\\/:*?"<>|]/g, '-');
    const path = `${this.templatesFolder}/${fileName}.md`;

    const existingFile = this.app.vault.getAbstractFileByPath(path);
    if (existingFile instanceof TFile) {
      await this.app.vault.modify(existingFile, template.content);
      new Notice(`Updated template: ${template.name}`);
      return existingFile;
    }

    const file = await this.app.vault.create(path, template.content);
    new Notice(`Created template: ${template.name}`);
    return file;
  }

  async listTemplates(): Promise<TFile[]> {
    const folder = this.app.vault.getAbstractFileByPath(this.templatesFolder);
    if (!(folder instanceof TFolder)) {
      return [];
    }

    return folder.children.filter((f): f is TFile => f instanceof TFile);
  }

  async applyTemplate(templatePath: string, targetPath: string, variables?: Record<string, string>): Promise<TFile> {
    const templateFile = this.app.vault.getAbstractFileByPath(templatePath);
    if (!(templateFile instanceof TFile)) {
      throw new Error(`Template not found: ${templatePath}`);
    }

    let content = await this.app.vault.read(templateFile);

    if (variables) {
      for (const [key, value] of Object.entries(variables)) {
        content = content.replace(new RegExp(`{{${key}}}`, 'g'), value);
      }
    }

    content = content.replace(/{{date}}/g, new Date().toISOString().split('T')[0]);
    content = content.replace(/{{time}}/g, new Date().toTimeString().split(' ')[0]);
    content = content.replace(/{{title}}/g, targetPath.split('/').pop()?.replace('.md', '') || '');

    const existingFile = this.app.vault.getAbstractFileByPath(targetPath);
    if (existingFile instanceof TFile) {
      await this.app.vault.modify(existingFile, content);
      return existingFile;
    }

    return await this.app.vault.create(targetPath, content);
  }

  async suggestTemplates(): Promise<void> {
    const patterns = await this.analyzeNotePatterns();

    if (patterns.length === 0) {
      new Notice('No common patterns found in your notes');
      return;
    }

    const patternsSummary = patterns
      .slice(0, 5)
      .map((p) => `- ${p.name}: ${p.structure.join(' → ')} (${p.frequency} notes)`)
      .join('\n');

    await this.api.createTask(
      `I found these patterns in the vault's notes:\n\n${patternsSummary}\n\nSuggest which patterns would make good templates and how to improve them.`,
    );

    new Notice('Template suggestions requested. Check Bytebot panel.');
  }
}
