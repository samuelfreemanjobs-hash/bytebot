import { Plugin, WorkspaceLeaf, TFile, Notice } from 'obsidian';
import { BytebotView, VIEW_TYPE_BYTEBOT } from './BytebotView';
import { BytebotAPI } from './api';
import { BytebotSettings, DEFAULT_SETTINGS, BytebotSettingTab } from './settings';
import { KnowledgeOrganizer } from './KnowledgeOrganizer';

export default class BytebotPlugin extends Plugin {
  settings: BytebotSettings;
  api: BytebotAPI;
  organizer: KnowledgeOrganizer;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.api = new BytebotAPI(this.settings.serverUrl);
    this.organizer = new KnowledgeOrganizer(this.app, this.api);

    this.registerView(VIEW_TYPE_BYTEBOT, (leaf) => new BytebotView(leaf, this));

    this.addRibbonIcon('bot', 'Open Bytebot', () => {
      this.activateView();
    });

    this.addCommand({
      id: 'open-bytebot',
      name: 'Open Bytebot chat',
      callback: () => {
        this.activateView();
      },
    });

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
      id: 'summarize-current-note',
      name: 'Summarize current note',
      editorCallback: async (editor, view) => {
        if (view.file) {
          await this.summarizeNote(view.file);
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

    this.addSettingTab(new BytebotSettingTab(this.app, this));

    if (this.settings.autoOrganize) {
      this.registerEvent(
        this.app.vault.on('create', async (file) => {
          if (file instanceof TFile && file.extension === 'md') {
            setTimeout(() => this.suggestOrganization(file), 1000);
          }
        }),
      );
    }
  }

  async onunload(): Promise<void> {
    this.api.disconnect();
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
  }

  private async organizeNote(file: TFile): Promise<void> {
    const content = await this.app.vault.read(file);
    const structure = await this.organizer.getVaultStructure();

    const message = `Please suggest how to organize this note within my vault:

Note: ${file.path}
Content:
${content}

Vault structure:
${structure}

Suggest: folder placement, tags, and links to related notes. Return actions in \`\`\`bytebot-action format.`;

    await this.activateView();
    const view = this.app.workspace.getLeavesOfType(VIEW_TYPE_BYTEBOT)[0]?.view as BytebotView;
    if (view) {
      const task = await this.api.createTask(message);
      new Notice('Analyzing note organization...');
    }
  }

  private async summarizeNote(file: TFile): Promise<void> {
    const content = await this.app.vault.read(file);

    const message = `Please summarize this note and suggest a concise title:

Note: ${file.path}
Content:
${content}

Provide a 2-3 sentence summary and suggest tags.`;

    await this.activateView();
    await this.api.createTask(message);
    new Notice('Generating summary...');
  }

  private async findRelatedNotes(file: TFile): Promise<void> {
    const content = await this.app.vault.read(file);
    const allFiles = this.app.vault.getMarkdownFiles();
    const fileList = allFiles.map((f) => f.path).join('\n');

    const message = `Find notes related to this one:

Current note: ${file.path}
Content: ${content.substring(0, 1000)}...

Available notes:
${fileList}

Suggest which notes should be linked and why.`;

    await this.activateView();
    await this.api.createTask(message);
    new Notice('Finding related notes...');
  }

  private async suggestOrganization(file: TFile): Promise<void> {
    const content = await this.app.vault.read(file);
    if (content.length < 50) return;

    new Notice(`Bytebot: Analyzing new note "${file.basename}"...`);

    const folders = this.settings.knowledgeFolders;
    const message = `A new note was created. Suggest where to organize it:

Note: ${file.path}
Content: ${content.substring(0, 500)}

Available folders: ${folders.join(', ')}

Should this note be moved? What tags should it have?`;

    try {
      await this.api.createTask(message);
    } catch (e) {
      console.log('Auto-organize failed:', e);
    }
  }
}
