import { App, PluginSettingTab, Setting } from 'obsidian';
import type BytebotPlugin from './main';

export interface BytebotSettings {
  serverUrl: string;
  autoOrganize: boolean;
  knowledgeFolders: string[];
  dailyNotesFolder: string;
  dailyNotesFormat: string;
  templatesFolder: string;
  enableSlackClips: boolean;
}

export const DEFAULT_SETTINGS: BytebotSettings = {
  serverUrl: 'http://localhost:3000',
  autoOrganize: false,
  knowledgeFolders: ['Knowledge', 'Notes', 'Projects'],
  dailyNotesFolder: 'Daily Notes',
  dailyNotesFormat: 'YYYY-MM-DD',
  templatesFolder: 'Templates',
  enableSlackClips: false,
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

    containerEl.createEl('h3', { text: 'Daily Notes' });

    new Setting(containerEl)
      .setName('Daily notes folder')
      .setDesc('Folder where daily notes are stored')
      .addText((text) =>
        text
          .setPlaceholder('Daily Notes')
          .setValue(this.plugin.settings.dailyNotesFolder)
          .onChange(async (value) => {
            this.plugin.settings.dailyNotesFolder = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Daily notes format')
      .setDesc('Date format for daily note filenames (moment.js format)')
      .addText((text) =>
        text
          .setPlaceholder('YYYY-MM-DD')
          .setValue(this.plugin.settings.dailyNotesFormat)
          .onChange(async (value) => {
            this.plugin.settings.dailyNotesFormat = value;
            await this.plugin.saveSettings();
          }),
      );

    containerEl.createEl('h3', { text: 'Templates' });

    new Setting(containerEl)
      .setName('Templates folder')
      .setDesc('Folder where templates are stored')
      .addText((text) =>
        text
          .setPlaceholder('Templates')
          .setValue(this.plugin.settings.templatesFolder)
          .onChange(async (value) => {
            this.plugin.settings.templatesFolder = value;
            await this.plugin.saveSettings();
          }),
      );

    containerEl.createEl('h3', { text: 'Integrations' });

    new Setting(containerEl)
      .setName('Enable Slack clips')
      .setDesc('Automatically sync clipped messages from Slack to daily notes')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableSlackClips)
          .onChange(async (value) => {
            this.plugin.settings.enableSlackClips = value;
            await this.plugin.saveSettings();
          }),
      );
  }
}
