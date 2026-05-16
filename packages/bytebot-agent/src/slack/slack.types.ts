export interface SlackEvent {
  type: string;
  event_ts: string;
  user?: string;
  channel?: string;
  text?: string;
  thread_ts?: string;
  ts?: string;
  bot_id?: string;
}

export interface SlackEventPayload {
  token: string;
  team_id: string;
  api_app_id: string;
  event: SlackEvent;
  type: string;
  event_id: string;
  event_time: number;
  challenge?: string;
}

export interface SlackUrlVerification {
  token: string;
  challenge: string;
  type: 'url_verification';
}

export interface SlackMessagePayload {
  channel: string;
  text: string;
  thread_ts?: string;
  blocks?: SlackBlock[];
}

export interface SlackBlock {
  type: string;
  text?: {
    type: string;
    text: string;
  };
  block_id?: string;
}

export interface SlackThreadMapping {
  threadTs: string;
  channelId: string;
  taskId: string;
}
