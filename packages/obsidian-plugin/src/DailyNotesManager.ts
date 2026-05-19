import { App, TFile, moment, Notice } from 'obsidian';
import { BytebotAPI } from './api';

export interface DailyNoteConfig {
  folder: string;
  format: string;
  template?: string;
}

export class DailyNotesManager {
  private app: App;
  private api: BytebotAPI;
  private config: DailyNoteConfig;

  constructor(app: App, api: BytebotAPI, config?: Partial<DailyNoteConfig>) {
    this.app = app;
    this.api = api;
    this.config = {
      folder: config?.folder || 'Daily Notes',
      format: config?.format || 'YYYY-MM-DD',
      template: config?.template,
    };
  }

  getDailyNotePath(date?: Date): string {
    const d = date || new Date();
    const dateStr = moment(d).format(this.config.format);
    return `${this.config.folder}/${dateStr}.md`;
  }

  async getTodaysNote(): Promise<TFile | null> {
    const path = this.getDailyNotePath();
    const file = this.app.vault.getAbstractFileByPath(path);
    return file instanceof TFile ? file : null;
  }

  async createDailyNote(date?: Date): Promise<TFile> {
    const path = this.getDailyNotePath(date);
    const folder = this.config.folder;

    const folderExists = this.app.vault.getAbstractFileByPath(folder);
    if (!folderExists) {
      await this.app.vault.createFolder(folder);
    }

    const existingFile = this.app.vault.getAbstractFileByPath(path);
    if (existingFile instanceof TFile) {
      return existingFile;
    }

    let content = await this.getTemplateContent(date);
    return await this.app.vault.create(path, content);
  }

  private async getTemplateContent(date?: Date): Promise<string> {
    const d = date || new Date();
    const dateStr = moment(d).format('dddd, MMMM D, YYYY');

    if (this.config.template) {
      const templateFile = this.app.vault.getAbstractFileByPath(this.config.template);
      if (templateFile instanceof TFile) {
        let content = await this.app.vault.read(templateFile);
        content = content.replace(/{{date}}/g, dateStr);
        content = content.replace(/{{time}}/g, moment(d).format('HH:mm'));
        return content;
      }
    }

    return `# ${dateStr}

## Tasks
- [ ]

## Notes


## Reflections

`;
  }

  async appendToDaily(content: string, section?: string): Promise<void> {
    let file = await this.getTodaysNote();
    if (!file) {
      file = await this.createDailyNote();
    }

    const existingContent = await this.app.vault.read(file);

    if (section) {
      const sectionRegex = new RegExp(`(## ${section}[\\s\\S]*?)(?=## |$)`, 'i');
      const match = existingContent.match(sectionRegex);

      if (match) {
        const sectionContent = match[1];
        const newSectionContent = sectionContent.trimEnd() + '\n' + content + '\n\n';
        const newContent = existingContent.replace(sectionRegex, newSectionContent);
        await this.app.vault.modify(file, newContent);
      } else {
        await this.app.vault.modify(file, existingContent + `\n## ${section}\n${content}\n`);
      }
    } else {
      await this.app.vault.modify(file, existingContent + '\n' + content);
    }

    new Notice(`Added to daily note`);
  }

  async summarizeDay(date?: Date): Promise<string> {
    const path = this.getDailyNotePath(date);
    const file = this.app.vault.getAbstractFileByPath(path);

    if (!(file instanceof TFile)) {
      return 'No daily note found for this date.';
    }

    const content = await this.app.vault.read(file);
    const dateStr = moment(date || new Date()).format('YYYY-MM-DD');

    const task = await this.api.createTask(
      `Summarize this daily note from ${dateStr}. Highlight completed tasks, key insights, and suggest follow-ups:\n\n${content}`,
    );

    return `Summary requested for ${dateStr}. Check the Bytebot panel for results.`;
  }

  async getWeekNotes(): Promise<{ date: string; file: TFile; content: string }[]> {
    const notes: { date: string; file: TFile; content: string }[] = [];
    const today = moment();

    for (let i = 0; i < 7; i++) {
      const date = today.clone().subtract(i, 'days');
      const path = `${this.config.folder}/${date.format(this.config.format)}.md`;
      const file = this.app.vault.getAbstractFileByPath(path);

      if (file instanceof TFile) {
        const content = await this.app.vault.read(file);
        notes.push({
          date: date.format('YYYY-MM-DD'),
          file,
          content,
        });
      }
    }

    return notes;
  }

  async generateWeeklySummary(): Promise<void> {
    const weekNotes = await this.getWeekNotes();

    if (weekNotes.length === 0) {
      new Notice('No daily notes found for this week');
      return;
    }

    const notesContent = weekNotes
      .map((n) => `### ${n.date}\n${n.content}`)
      .join('\n\n---\n\n');

    await this.api.createTask(
      `Generate a weekly summary from these daily notes. Identify patterns, achievements, and areas for improvement:\n\n${notesContent}`,
    );

    new Notice('Weekly summary requested. Check Bytebot panel.');
  }

  async clipToDaily(text: string, source?: string): Promise<void> {
    const timestamp = moment().format('HH:mm');
    const sourceTag = source ? ` (from ${source})` : '';
    const entry = `- ${timestamp}${sourceTag}: ${text}`;

    await this.appendToDaily(entry, 'Notes');
  }
}
