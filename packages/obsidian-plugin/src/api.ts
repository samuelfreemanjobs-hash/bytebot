export interface BytebotTask {
  id: string;
  description: string;
  status: string;
  createdAt: string;
}

export interface BytebotMessage {
  id: string;
  content: MessageContentBlock[];
  role: 'USER' | 'ASSISTANT';
  createdAt: string;
}

export interface MessageContentBlock {
  type: string;
  text?: string;
}

export interface CreateTaskResponse {
  id: string;
  description: string;
  status: string;
}

export class BytebotAPI {
  private baseUrl: string;
  private ws: WebSocket | null = null;
  private messageHandlers: ((message: BytebotMessage) => void)[] = [];

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async createTask(description: string): Promise<CreateTaskResponse> {
    const response = await fetch(`${this.baseUrl}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description,
        model: {
          provider: 'anthropic',
          name: 'claude-sonnet-4-20250514',
          title: 'Claude Sonnet 4',
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to create task: ${response.statusText}`);
    }

    return response.json();
  }

  async addMessage(taskId: string, message: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/tasks/${taskId}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    });

    if (!response.ok) {
      throw new Error(`Failed to add message: ${response.statusText}`);
    }
  }

  async getMessages(taskId: string): Promise<BytebotMessage[]> {
    const response = await fetch(`${this.baseUrl}/tasks/${taskId}/messages`);

    if (!response.ok) {
      throw new Error(`Failed to get messages: ${response.statusText}`);
    }

    return response.json();
  }

  connectWebSocket(taskId: string): void {
    const wsUrl = this.baseUrl.replace(/^http/, 'ws');
    this.ws = new WebSocket(`${wsUrl}/tasks`);

    this.ws.onopen = () => {
      this.ws?.send(JSON.stringify({ event: 'subscribe', taskId }));
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.event === 'newMessage' && data.taskId === taskId) {
          this.messageHandlers.forEach((handler) => handler(data.message));
        }
      } catch (e) {
        console.error('Failed to parse WebSocket message:', e);
      }
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }

  onMessage(handler: (message: BytebotMessage) => void): void {
    this.messageHandlers.push(handler);
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.messageHandlers = [];
  }
}
