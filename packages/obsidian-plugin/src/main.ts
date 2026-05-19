import { Plugin, WorkspaceLeaf, TFile, Notice } from 'obsidian';
import { BytebotView, VIEW_TYPE_BYTEBOT } from './BytebotView';
import { BytebotAPI } from './api';
import { BytebotSettings, DEFAULT_SETTINGS, BytebotSettingTab } from './settings';
import { KnowledgeOrganizer } from './KnowledgeOrganizer';
import { DailyNotesManager } from './DailyNotesManager';
import { TemplateGenerator } from './TemplateGenerator';

export default class BytebotPlugin extends Plugin {
  settings: BytebotSettings;
  api: BytebotAPI;
  organizer: KnowledgeOrganizer;
  dailyNotes: DailyNotesManager;
  templates: TemplateGenerator;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.api = new BytebotAPI(this.settings.serverUrl);
    this.organizer = new KnowledgeOrganizer(this.app, this.api);
    this.dailyNotes = new DailyNotesManager(this.app, this.api, {
      folder: this.settings.dailyNotesFolder,
      format: this.settings.dailyNotesFormat,
    });
    this.templates = new TemplateGenerator(this.app, this.api, this.settings.templatesFolder);

    this.registerView(VIEW_TYPE_BYTEBOT, (leaf) => new BytebotView(leaf, this));

    this.addRibbonIcon('bot', 'Open Bytebot', () => {
      this.activateView();
    });

    // Core commands
    this.addCommand({
      id: 'open-bytebot',
      name: 'Open Bytebot chat',
      callback: () => this.activateView(),
    });

    // Daily notes commands
    this.addCommand({
      id: 'create-daily-note',
      name: 'Create today\'s daily note',
      callback: async () => {
        const file = await this.dailyNotes.createDailyNote();
        await this.app.workspace.getLeaf().openFile(file);
      },
    });

    this.addCommand({
      id: 'summarize-daily-note',
      name: 'Summarize today\'s daily note',
      callback: async () => {
        await this.dailyNotes.summarizeDay();
        await this.activateView();
      },
    });

    this.addCommand({
      id: 'weekly-summary',
      name: 'Generate weekly summary',
      callback: async () => {
        await this.dailyNotes.generateWeeklySummary();
        await this.activateView();
      },
    });

    this.addCommand({
      id: 'clip-to-daily',
      name: 'Clip selection to daily note',
      editorCallback: async (editor) => {
        const selection = editor.getSelection();
        if (selection) {
          await this.dailyNotes.clipToDaily(selection);
        } else {
          new Notice('No text selected');
        }
      },
    });

    // Template commands
    this.addCommand({
      id: 'suggest-templates',
      name: 'Suggest templates from note patterns',
      callback: async () => {
        await this.templates.suggestTemplates();
        await this.activateView();
      },
    });

    this.addCommand({
      id: 'generate-template',
      name: 'Generate template with AI',
      callback: async () => {
        const description = await this.promptForInput('Describe the template you want:');
        if (description) {
          const template = await this.templates.generateTemplateWithAI(description);
          await this.templates.saveTemplate(template);
          await this.activateView();
        }
      },
    });

    this.addCommand({
      id: 'create-from-template',
      name: 'Create note from template',
      callback: async () => {
        const templateFiles = await this.templates.listTemplates();
        if (templateFiles.length === 0) {
          new Notice('No templates found. Create some first!');
          return;
        }
        // This would ideally show a modal to select template
        const templatePath = templateFiles[0].path;
        const noteName = await this.promptForInput('Note name:');
        if (noteName) {
          const file = await this.templates.applyTemplate(
            templatePath,
            `${noteName}.md`,
          );
          await this.app.workspace.getLeaf().openFile(file);
        }
      },
    });

    // Organization commands
    this.addCommand({
      id: 'organize-current-note',
      name: 'Organize current note',
      editorCallback: async (editor, view) => {
        if (view.file) {
          await this.organizeNote(view.file);
        }
      },
    });

    this.addCommand({
      id: 'find-related-notes',
      name: 'Find related notes',
      editorCallback: async (editor, view) => {
        if (view.file) {
          await this.findRelatedNotes(view.file);
        }
      },
    });

    // Schedule commands
    this.addCommand({
      id: 'setup-daily-summary',
      name: 'Setup daily summary schedule',
      callback: async () => {
        const time = await this.promptForInput('Time for daily summary (HH:MM):');
        if (time) {
          await this.setupDailySummary(time);
        }
      },
    });

    this.addSettingTab(new BytebotSettingTab(this.app, this));

    // Auto-organize new notes
    if (this.settings.autoOrganize) {
      this.registerEvent(
        this.app.vault.on('create', async (file) => {
          if (file instanceof TFile && file.extension === 'md') {
            setTimeout(() => this.suggestOrganization(file), 1000);
          }
        }),
      );
    }

    // Listen for Slack clips
    this.setupClipListener();
  }

  async onunload(): Promise<void> {
    this.api.disconnect();
  }

  private setupClipListener(): void {
    // Poll for clips from the server (would be better as WebSocket)
    if (this.settings.enableSlackClips) {
      this.registerInterval(
        window.setInterval(async () => {
          await this.checkForClips();
        }, 30000),
      );
    }
  }

  private async checkForClips(): Promise<void> {
    try {
      const response = await fetch(`${this.settings.serverUrl}/clips/pending`);
      if (response.ok) {
        const clips = await response.json();
        for (const clip of clips) {
          await this.dailyNotes.clipToDaily(clip.text, 'Slack');
        }
      }
    } catch (e) {
      // Server might not be running
    }
  }

  private async promptForInput(prompt: string): Promise<string | null> {
    return new Promise((resolve) => {
      const modal = new InputModal(this.app, prompt, (result) => {
        resolve(result);
      });
      modal.open();
    });
  }

  async activateView(): Promise<void> {
    const { workspace } = this.app;

    let leaf: WorkspaceLeaf | null = null;
    const leaves = workspace.getLeavesOfType(VIEW_TYPE_BYTEBOT);

    if (leaves.length > 0) {
      leaf = leaves[0];
    } else {
      leaf = workspace.getRightLeaf(false);
      if (leaf) {
        await leaf.setViewState({
          type: VIEW_TYPE_BYTEBOT,
          active: true,
        });
      }
    }

    if (leaf) {
      workspace.revealLeaf(leaf);
    }
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.api = new BytebotAPI(this.settings.serverUrl);
    this.dailyNotes = new DailyNotesManager(this.app, this.api, {
      folder: this.settings.dailyNotesFolder,
      format: this.settings.dailyNotesFormat,
    });
    this.templates = new TemplateGenerator(this.app, this.api, this.settings.templatesFolder);
  }

  private async organizeNote(file: TFile): Promise<void> {
    const content = await this.app.vault.read(file);
    const structure = await this.organizer.getVaultStructure();

    await this.api.createTask(
      `Organize this note: ${file.path}\n\nContent:\n${content}\n\nVault structure:\n${structure}`,
    );
    await this.activateView();
    new Notice('Analyzing note organization...');
  }

  private async findRelatedNotes(file: TFile): Promise<void> {
    const content = await this.app.vault.read(file);
    const allFiles = this.app.vault.getMarkdownFiles();
    const fileList = allFiles.map((f) => f.path).join('\n');

    await this.api.createTask(
      `Find notes related to ${file.path}:\n\nContent: ${content.substring(0, 1000)}\n\nAvailable notes:\n${fileList}`,
    );
    await this.activateView();
    new Notice('Finding related notes...');
  }

  private async suggestOrganization(file: TFile): Promise<void> {
    const content = await this.app.vault.read(file);
    if (content.length < 50) return;

    await this.api.createTask(
      `New note created: ${file.path}\nContent: ${content.substring(0, 500)}\n\nSuggest organization.`,
    );
  }

  private async setupDailySummary(time: string): Promise<void> {
    try {
      const response = await fetch(`${this.settings.serverUrl}/scheduled-tasks/presets/daily-summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          time,
          vaultName: this.app.vault.getName(),
        }),
      });

      if (response.ok) {
        new Notice(`Daily summary scheduled for ${time}`);
      } else {
        new Notice('Failed to setup schedule');
      }
    } catch (e) {
      new Notice('Could not connect to Bytebot server');
    }
  }
}

import { Modal, App } from 'obsidian';

class InputModal extends Modal {
  result: string;
  prompt: string;
  onSubmit: (result: string | null) => void;

  constructor(app: App, prompt: string, onSubmit: (result: string | null) => void) {
    super(app);
    this.prompt = prompt;
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;

    contentEl.createEl('h3', { text: this.prompt });

    const input = contentEl.createEl('input', {
      type: 'text',
      cls: 'bytebot-input-modal',
    });
    input.style.width = '100%';
    input.style.marginBottom = '10px';

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.close();
        this.onSubmit(input.value);
      }
    });

    const buttonContainer = contentEl.createDiv({ cls: 'bytebot-button-container' });
    buttonContainer.style.display = 'flex';
    buttonContainer.style.gap = '10px';

    const submitBtn = buttonContainer.createEl('button', { text: 'Submit' });
    submitBtn.addEventListener('click', () => {
      this.close();
      this.onSubmit(input.value);
    });

    const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' });
    cancelBtn.addEventListener('click', () => {
      this.close();
      this.onSubmit(null);
    });

    input.focus();
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
