import { ItemView, WorkspaceLeaf, MarkdownRenderer, Notice } from 'obsidian';
import type BytebotPlugin from './main';
import { BytebotMessage } from './api';
import { NoteAction } from './KnowledgeOrganizer';

export const VIEW_TYPE_BYTEBOT = 'bytebot-view';

export class BytebotView extends ItemView {
  plugin: BytebotPlugin;
  private messagesContainer: HTMLElement;
  private inputEl: HTMLTextAreaElement;
  private currentTaskId: string | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: BytebotPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_BYTEBOT;
  }

  getDisplayText(): string {
    return 'Bytebot';
  }

  getIcon(): string {
    return 'bot';
  }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass('bytebot-container');

    const header = container.createDiv({ cls: 'bytebot-header' });
    header.createEl('h4', { text: 'Bytebot Assistant' });

    const newChatBtn = header.createEl('button', { text: 'New Chat', cls: 'bytebot-new-chat' });
    newChatBtn.addEventListener('click', () => this.startNewChat());

    this.messagesContainer = container.createDiv({ cls: 'bytebot-messages' });

    const inputContainer = container.createDiv({ cls: 'bytebot-input-container' });

    this.inputEl = inputContainer.createEl('textarea', {
      cls: 'bytebot-input',
      attr: { placeholder: 'Ask Bytebot anything... (Shift+Enter for newline)' },
    });

    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    const buttonRow = inputContainer.createDiv({ cls: 'bytebot-button-row' });

    const sendBtn = buttonRow.createEl('button', { text: 'Send', cls: 'bytebot-send' });
    sendBtn.addEventListener('click', () => this.sendMessage());

    const organizeBtn = buttonRow.createEl('button', {
      text: 'Organize Vault',
      cls: 'bytebot-organize',
    });
    organizeBtn.addEventListener('click', () => this.requestOrganization());

    this.addStyles();
    this.addWelcomeMessage();
  }

  private addWelcomeMessage(): void {
    this.addMessage({
      id: 'welcome',
      role: 'ASSISTANT',
      content: [
        {
          type: 'text',
          text: "Hi! I'm Bytebot. I can help you:\n\n- **Chat** about anything\n- **Edit notes** in your vault\n- **Organize** your knowledge\n- **Create** new notes and links\n\nWhat would you like to do?",
        },
      ],
      createdAt: new Date().toISOString(),
    });
  }

  private async startNewChat(): Promise<void> {
    this.currentTaskId = null;
    this.messagesContainer.empty();
    this.plugin.api.disconnect();
    this.addWelcomeMessage();
  }

  private async sendMessage(): Promise<void> {
    const text = this.inputEl.value.trim();
    if (!text) return;

    this.inputEl.value = '';

    const vaultContext = this.plugin.organizer.getContextForAgent();
    const fullMessage = `[Obsidian Context]\n${vaultContext}\n\n[User Request]\n${text}`;

    this.addMessage({
      id: Date.now().toString(),
      role: 'USER',
      content: [{ type: 'text', text }],
      createdAt: new Date().toISOString(),
    });

    try {
      if (!this.currentTaskId) {
        const task = await this.plugin.api.createTask(fullMessage);
        this.currentTaskId = task.id;

        this.plugin.api.connectWebSocket(task.id);
        this.plugin.api.onMessage((msg) => this.handleAgentMessage(msg));
      } else {
        await this.plugin.api.addMessage(this.currentTaskId, fullMessage);
      }
    } catch (error) {
      new Notice(`Error: ${error}`);
      this.addMessage({
        id: 'error',
        role: 'ASSISTANT',
        content: [
          {
            type: 'text',
            text: `Failed to connect to Bytebot server. Make sure it's running at ${this.plugin.settings.serverUrl}`,
          },
        ],
        createdAt: new Date().toISOString(),
      });
    }
  }

  private handleAgentMessage(message: BytebotMessage): void {
    if (message.role === 'ASSISTANT') {
      this.addMessage(message);
      this.parseAndExecuteActions(message);
    }
  }

  private async parseAndExecuteActions(message: BytebotMessage): Promise<void> {
    for (const block of message.content) {
      if (block.type === 'text' && block.text) {
        const actionMatch = block.text.match(/```bytebot-action\n([\s\S]*?)\n```/);
        if (actionMatch) {
          try {
            const action: NoteAction = JSON.parse(actionMatch[1]);
            await this.plugin.organizer.executeAction(action);
          } catch (e) {
            console.error('Failed to parse action:', e);
          }
        }
      }
    }
  }

  private async requestOrganization(): Promise<void> {
    const structure = await this.plugin.organizer.getVaultStructure();
    const message = `Please analyze my vault structure and suggest how to better organize my notes:\n\n${structure}`;

    this.inputEl.value = message;
    await this.sendMessage();
  }

  private addMessage(message: BytebotMessage): void {
    const msgEl = this.messagesContainer.createDiv({
      cls: `bytebot-message bytebot-message-${message.role.toLowerCase()}`,
    });

    for (const block of message.content) {
      if (block.type === 'text' && block.text) {
        const contentEl = msgEl.createDiv({ cls: 'bytebot-message-content' });
        MarkdownRenderer.render(this.app, block.text, contentEl, '', this.plugin);
      }
    }

    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
  }

  private addStyles(): void {
    const style = document.createElement('style');
    style.textContent = `
      .bytebot-container {
        display: flex;
        flex-direction: column;
        height: 100%;
        padding: 10px;
      }
      .bytebot-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 10px;
        padding-bottom: 10px;
        border-bottom: 1px solid var(--background-modifier-border);
      }
      .bytebot-header h4 {
        margin: 0;
      }
      .bytebot-new-chat {
        font-size: 12px;
        padding: 4px 8px;
      }
      .bytebot-messages {
        flex: 1;
        overflow-y: auto;
        margin-bottom: 10px;
      }
      .bytebot-message {
        margin-bottom: 12px;
        padding: 10px;
        border-radius: 8px;
      }
      .bytebot-message-user {
        background: var(--interactive-accent);
        color: var(--text-on-accent);
        margin-left: 20%;
      }
      .bytebot-message-assistant {
        background: var(--background-secondary);
        margin-right: 20%;
      }
      .bytebot-message-content {
        font-size: 14px;
        line-height: 1.5;
      }
      .bytebot-message-content p {
        margin: 0 0 8px 0;
      }
      .bytebot-message-content p:last-child {
        margin-bottom: 0;
      }
      .bytebot-input-container {
        border-top: 1px solid var(--background-modifier-border);
        padding-top: 10px;
      }
      .bytebot-input {
        width: 100%;
        min-height: 60px;
        resize: vertical;
        margin-bottom: 8px;
        padding: 8px;
        border-radius: 4px;
        border: 1px solid var(--background-modifier-border);
        background: var(--background-primary);
        color: var(--text-normal);
      }
      .bytebot-button-row {
        display: flex;
        gap: 8px;
      }
      .bytebot-send {
        flex: 1;
      }
      .bytebot-organize {
        flex: 1;
      }
    `;
    document.head.appendChild(style);
  }

  async onClose(): Promise<void> {
    this.plugin.api.disconnect();
  }
}
