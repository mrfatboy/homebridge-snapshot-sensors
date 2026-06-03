import { beforeEach, describe, expect, it, vi } from 'vitest';

const createSession = vi.fn();
const releaseSession = vi.fn();

vi.mock('onnxruntime-node', () => ({
  env: { logLevel: 'warning' as const },
  InferenceSession: {
    create: createSession,
  },
  Tensor: class Tensor {
    constructor(
      public type: string,
      public data: unknown,
      public dims: number[],
    ) {}
  },
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  createSession.mockResolvedValue({
    inputNames: ['images'],
    run: vi.fn(),
    release: releaseSession,
  });
});

describe('loadModel()', () => {
  it('sets ONNX Runtime to error-only logging before creating the CPU session', async () => {
    const { loadModel } = await import('../src/inference.js');
    const ort = await import('onnxruntime-node');

    await loadModel();

    expect(ort.env.logLevel).toBe('error');
    expect(createSession).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        executionProviders: ['cpu'],
        graphOptimizationLevel: 'all',
        logSeverityLevel: 3,
      }),
    );
  });
});
