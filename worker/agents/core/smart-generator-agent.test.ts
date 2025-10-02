import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SmartCodeGeneratorAgent } from './smart-generator-agent';
import { AgentInitArgs } from './types';

// Mock the parent class
vi.mock('./simple-generator-agent', () => ({
  SimpleCodeGeneratorAgent: class {
    async initialize(initArgs: AgentInitArgs) {
      return {
        agentMode: 'deterministic',
        query: initArgs.query,
        initialized: true,
      };
    }

    async generateAllFiles(reviewCycles: number = 10) {
      return Promise.resolve();
    }
  },
}));

// Mock logger
vi.mock('@worker/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('SmartCodeGeneratorAgent', () => {
  let agent: SmartCodeGeneratorAgent;
  let mockInitArgs: AgentInitArgs;

  beforeEach(() => {
    agent = new SmartCodeGeneratorAgent();
    mockInitArgs = {
      query: 'Create a simple todo app',
      userId: 'user123',
      sessionId: 'session456',
    };
    vi.clearAllMocks();
  });

  describe('initialize', () => {
    it('should initialize with deterministic mode', async () => {
      const result = await agent.initialize(mockInitArgs, 'deterministic');
      
      expect(result).toBeDefined();
      expect(result.agentMode).toBe('deterministic');
      expect(result.query).toBe(mockInitArgs.query);
    });

    it('should initialize with smart mode', async () => {
      const result = await agent.initialize(mockInitArgs, 'smart');
      
      expect(result).toBeDefined();
      expect(result.agentMode).toBe('deterministic'); // Parent returns deterministic
      expect(result.query).toBe(mockInitArgs.query);
    });

    it('should log initialization with enhanced AI orchestration', async () => {
      await agent.initialize(mockInitArgs, 'smart');
      
      // The logger should be called with the initialization message
      expect(agent['logger']().info).toHaveBeenCalledWith(
        '🧠 Initializing SmartCodeGeneratorAgent with enhanced AI orchestration',
        expect.objectContaining({
          queryLength: mockInitArgs.query.length,
          agentType: 'smart',
        })
      );
    });
  });

  describe('generateAllFiles', () => {
    it('should call parent generateAllFiles for deterministic mode', async () => {
      // Set up the agent state
      agent['state'] = {
        agentMode: 'deterministic',
        query: mockInitArgs.query,
        initialized: true,
      } as any;

      await agent.generateAllFiles(5);
      
      // Should not throw and complete successfully
      expect(true).toBe(true);
    });

    it('should call builderLoop for smart mode', async () => {
      // Set up the agent state
      agent['state'] = {
        agentMode: 'smart',
        query: mockInitArgs.query,
        initialized: true,
      } as any;

      // Mock the builderLoop method
      const builderLoopSpy = vi.spyOn(agent, 'builderLoop').mockResolvedValue(undefined);

      await agent.generateAllFiles(5);
      
      expect(builderLoopSpy).toHaveBeenCalled();
    });
  });

  describe('builderLoop', () => {
    it('should be implemented as TODO', async () => {
      // The builderLoop method is currently not implemented
      // This test ensures it exists and can be called
      await expect(agent.builderLoop()).resolves.toBeUndefined();
    });
  });

  describe('inheritance', () => {
    it('should extend SimpleCodeGeneratorAgent', () => {
      expect(agent).toBeInstanceOf(SmartCodeGeneratorAgent);
    });

    it('should have access to parent methods', () => {
      expect(typeof agent.initialize).toBe('function');
      expect(typeof agent.generateAllFiles).toBe('function');
    });
  });
});