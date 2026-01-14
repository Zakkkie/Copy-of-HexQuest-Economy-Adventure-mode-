
import { describe, it, expect } from 'vitest';
import { ActionProcessor } from '../ActionProcessor';

describe('ActionProcessor', () => {
  it('should be defined', () => {
    const processor = new ActionProcessor();
    expect(processor).toBeDefined();
  });
});
