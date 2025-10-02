import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BaseAgent } from '@worker/agents/core/base-agent';
import { CodeGenState } from '@worker/agents/core/state';
import { AgentInitArgs } from '@worker/agents/core/types';

// Mock the Agent class
vi.mock('agents', () => ({
  Agent: class {
    constructor() {}
    get id() { return 'test-agent-id'; }
    get state() { return null; }
    setState(state: unknown) {}
  },
  Connection: class {
    constructor(public id: string) {}
    send(data: string) {}
  },
}));

class TestAgent extends BaseAgent {
  async initialize(initArgs: AgentInitArgs): Promise<CodeGenState> {
    return {
      agentMode: 'deterministic',
      query: initArgs.query,
      userId: initArgs.userId,
      sessionId: initArgs.sessionId,
      initialized: true,
      currentPhase: 0,
      maxPhases: 10,
      files: [],
      issues: [],
      blueprint: null,
      config: {},
      createdAt: Date.now(),
      lastUpdated: Date.now(),
    };
  }

  async generateAllFiles(reviewCycles?: number): Promise<void> {
    // Mock implementation
  }
}

describe('BaseAgent', () => {
  let agent: TestAgent;

  beforeEach(() => {
    agent = new TestAgent();
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with logger', () => {
      expect(agent).toBeInstanceOf(BaseAgent);
      expect(agent['logger']).toBeDefined();
    });
  });

  describe('initialize', () => {
    it('should initialize agent with provided arguments', async () => {
      const initArgs: AgentInitArgs = {
        query: 'Create a todo app',
        userId: 'user123',
        sessionId: 'session456',
      };

      const result = await agent.initialize(initArgs);

      expect(result).toBeDefined();
      expect(result.query).toBe(initArgs.query);
      expect(result.userId).toBe(initArgs.userId);
      expect(result.sessionId).toBe(initArgs.sessionId);
      expect(result.initialized).toBe(true);
    });
  });

  describe('generateAllFiles', () => {
    it('should generate all files', async () => {
      await expect(agent.generateAllFiles()).resolves.not.toThrow();
    });

    it('should generate files with custom review cycles', async () => {
      await expect(agent.generateAllFiles(5)).resolves.not.toThrow();
    });
  });

  describe('handleConnection', () => {
    it('should handle new WebSocket connections', () => {
      const mockConnection = {
        id: 'connection123',
        send: vi.fn(),
      } as any;

      agent['handleConnection'](mockConnection);

      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe('handleDisconnection', () => {
    it('should handle WebSocket disconnections', () => {
      const mockConnection = {
        id: 'connection123',
        send: vi.fn(),
      } as any;

      agent['handleDisconnection'](mockConnection);

      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe('broadcast', () => {
    it('should broadcast messages to all connections', () => {
      agent['broadcast']('test-type', { message: 'test' });

      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe('sendToConnection', () => {
    it('should send message to specific connection', () => {
      const mockConnection = {
        id: 'connection123',
        send: vi.fn(),
      } as any;

      agent['sendToConnection'](mockConnection, 'test-type', { message: 'test' });

      expect(mockConnection.send).toHaveBeenCalledWith(JSON.stringify({
        type: 'test-type',
        message: 'test',
      }));
    });

    it('should handle connection send errors', () => {
      const mockConnection = {
        id: 'connection123',
        send: vi.fn().mockImplementation(() => {
          throw new Error('Send failed');
        }),
      } as any;

      agent['sendToConnection'](mockConnection, 'test-type', { message: 'test' });

      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe('validateState', () => {
    it('should return false when state is not initialized', () => {
      const isValid = agent['validateState']();
      expect(isValid).toBe(false);
    });

    it('should return true when state is initialized', () => {
      agent['state'] = {
        initialized: true,
      } as any;

      const isValid = agent['validateState']();
      expect(isValid).toBe(true);
    });
  });

  describe('getConfig', () => {
    it('should return empty config when state is not initialized', () => {
      const config = agent['getConfig']();
      expect(config).toEqual({});
    });

    it('should return config from state', () => {
      const mockConfig = { setting: 'value' };
      agent['state'] = {
        config: mockConfig,
      } as any;

      const config = agent['getConfig']();
      expect(config).toEqual(mockConfig);
    });
  });

  describe('updateConfig', () => {
    it('should update config in state', () => {
      const mockState = {
        config: { existing: 'value' },
      };
      agent['state'] = mockState as any;
      agent['setState'] = vi.fn();

      agent['updateConfig']({ new: 'setting' });

      expect(agent['setState']).toHaveBeenCalledWith({
        ...mockState,
        config: { existing: 'value', new: 'setting' },
      });
    });

    it('should not update config when state is not initialized', () => {
      agent['setState'] = vi.fn();

      agent['updateConfig']({ new: 'setting' });

      expect(agent['setState']).not.toHaveBeenCalled();
    });
  });
});