import { App, PluginSettingTab, Setting } from 'obsidian';
import type BytebotPlugin from './main';

export interface BytebotSettings {
  serverUrl: string;
  autoOrganize: boolean;
  knowledgeFolders: string[];
}

export const DEFAULT_SETTINGS: BytebotSettings = {
  serverUrl: 'http://localhost:3000',
  autoOrganize: false,
  knowledgeFolders: ['Knowledge', 'Notes', 'Projects'],
};

export class BytebotSettingTab extends PluginSettingTab {
  plugin: BytebotPlugin;

  constructor(app: App, plugin: BytebotPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'Bytebot Settings' });

    new Setting(containerEl)
      .setName('Server URL')
      .setDesc('URL of your Bytebot agent server')
      .addText((text) =>
        text
          .setPlaceholder('http://localhost:3000')
          .setValue(this.plugin.settings.serverUrl)
          .onChange(async (value) => {
            this.plugin.settings.serverUrl = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Auto-organize')
      .setDesc('Automatically suggest organization for new notes')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autoOrganize)
          .onChange(async (value) => {
            this.plugin.settings.autoOrganize = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Knowledge folders')
      .setDesc('Comma-separated list of folders for knowledge organization')
      .addText((text) =>
        text
          .setPlaceholder('Knowledge, Notes, Projects')
          .setValue(this.plugin.settings.knowledgeFolders.join(', '))
          .onChange(async (value) => {
            this.plugin.settings.knowledgeFolders = value
              .split(',')
              .map((s) => s.trim())
              .filter((s) => s.length > 0);
            await this.plugin.saveSettings();
          }),
      );
  }
}
