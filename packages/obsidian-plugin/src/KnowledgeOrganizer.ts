import { App, TFile, TFolder, Notice } from 'obsidian';
import { BytebotAPI } from './api';

export interface NoteAction {
  type: 'create' | 'edit' | 'move' | 'link' | 'tag';
  path: string;
  content?: string;
  newPath?: string;
  links?: string[];
  tags?: string[];
}

export interface OrganizationPlan {
  actions: NoteAction[];
  summary: string;
}

export class KnowledgeOrganizer {
  private app: App;
  private api: BytebotAPI;

  constructor(app: App, api: BytebotAPI) {
    this.app = app;
    this.api = api;
  }

  async getVaultStructure(): Promise<string> {
    const files = this.app.vault.getMarkdownFiles();
    const folders = new Set<string>();

    files.forEach((file) => {
      const parts = file.path.split('/');
      for (let i = 1; i < parts.length; i++) {
        folders.add(parts.slice(0, i).join('/'));
      }
    });

    const structure: string[] = ['Vault Structure:', ''];

    Array.from(folders)
      .sort()
      .forEach((folder) => {
        const depth = folder.split('/').length;
        structure.push('  '.repeat(depth - 1) + '📁 ' + folder.split('/').pop());
      });

    structure.push('', `Total files: ${files.length}`);
    return structure.join('\n');
  }

  async readNote(path: string): Promise<string | null> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      return await this.app.vault.read(file);
    }
    return null;
  }

  async createNote(path: string, content: string): Promise<TFile> {
    const folder = path.substring(0, path.lastIndexOf('/'));
    if (folder) {
      await this.ensureFolder(folder);
    }
    return await this.app.vault.create(path, content);
  }

  async editNote(path: string, content: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      await this.app.vault.modify(file, content);
      new Notice(`Updated: ${path}`);
    } else {
      await this.createNote(path, content);
      new Notice(`Created: ${path}`);
    }
  }

  async appendToNote(path: string, content: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      const existing = await this.app.vault.read(file);
      await this.app.vault.modify(file, existing + '\n\n' + content);
      new Notice(`Appended to: ${path}`);
    } else {
      await this.createNote(path, content);
      new Notice(`Created: ${path}`);
    }
  }

  async moveNote(oldPath: string, newPath: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(oldPath);
    if (file instanceof TFile) {
      const newFolder = newPath.substring(0, newPath.lastIndexOf('/'));
      if (newFolder) {
        await this.ensureFolder(newFolder);
      }
      await this.app.fileManager.renameFile(file, newPath);
      new Notice(`Moved: ${oldPath} → ${newPath}`);
    }
  }

  async addLinks(path: string, links: string[]): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      const content = await this.app.vault.read(file);
      const linkSection = '\n\n## Related\n' + links.map((l) => `- [[${l}]]`).join('\n');
      await this.app.vault.modify(file, content + linkSection);
      new Notice(`Added ${links.length} links to: ${path}`);
    }
  }

  async addTags(path: string, tags: string[]): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      const content = await this.app.vault.read(file);
      const tagLine = tags.map((t) => (t.startsWith('#') ? t : `#${t}`)).join(' ');

      if (content.startsWith('---')) {
        const endOfFrontmatter = content.indexOf('---', 3);
        if (endOfFrontmatter !== -1) {
          const newContent =
            content.slice(0, endOfFrontmatter + 3) +
            '\n' +
            tagLine +
            content.slice(endOfFrontmatter + 3);
          await this.app.vault.modify(file, newContent);
        }
      } else {
        await this.app.vault.modify(file, tagLine + '\n\n' + content);
      }
      new Notice(`Added tags to: ${path}`);
    }
  }

  async executeAction(action: NoteAction): Promise<void> {
    switch (action.type) {
      case 'create':
        if (action.content) {
          await this.createNote(action.path, action.content);
        }
        break;
      case 'edit':
        if (action.content) {
          await this.editNote(action.path, action.content);
        }
        break;
      case 'move':
        if (action.newPath) {
          await this.moveNote(action.path, action.newPath);
        }
        break;
      case 'link':
        if (action.links) {
          await this.addLinks(action.path, action.links);
        }
        break;
      case 'tag':
        if (action.tags) {
          await this.addTags(action.path, action.tags);
        }
        break;
    }
  }

  async executePlan(plan: OrganizationPlan): Promise<void> {
    new Notice(`Executing plan: ${plan.summary}`);
    for (const action of plan.actions) {
      await this.executeAction(action);
    }
    new Notice('Plan completed!');
  }

  private async ensureFolder(path: string): Promise<void> {
    const folder = this.app.vault.getAbstractFileByPath(path);
    if (!folder) {
      await this.app.vault.createFolder(path);
    }
  }

  async searchNotes(query: string): Promise<TFile[]> {
    const files = this.app.vault.getMarkdownFiles();
    const results: TFile[] = [];

    for (const file of files) {
      if (file.path.toLowerCase().includes(query.toLowerCase())) {
        results.push(file);
        continue;
      }

      const content = await this.app.vault.cachedRead(file);
      if (content.toLowerCase().includes(query.toLowerCase())) {
        results.push(file);
      }
    }

    return results;
  }

  getContextForAgent(): string {
    const activeFile = this.app.workspace.getActiveFile();
    let context = '';

    if (activeFile) {
      context += `Current note: ${activeFile.path}\n`;
    }

    context += `Vault: ${this.app.vault.getName()}\n`;
    context += `Total notes: ${this.app.vault.getMarkdownFiles().length}\n`;

    return context;
  }
}
