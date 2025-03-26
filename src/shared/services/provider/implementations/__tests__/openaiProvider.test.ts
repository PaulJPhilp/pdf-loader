import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { ModelConfig } from '../../../model/schemas/modelConfig.js'
import { OpenAIProvider } from '../openaiProvider.js'

describe('OpenAIProvider', () => {
    const mockModelConfig: ModelConfig = {
        id: 'gpt-4',
        modelName: 'gpt-4',
        provider: 'openai',
        maxTokens: 8192,
        temperature: 0.7,
        contextWindowSize: 'large',
        capabilities: ['text-generation'],
        description: 'GPT-4 model'
    }

    // Store original env
    const originalEnv = process.env['OPENAI_API_KEY']

    beforeEach(() => {
        // Set up test API key
        process.env['OPENAI_API_KEY'] = 'test-api-key'
        vi.clearAllMocks()
    })

    afterEach(() => {
        // Restore original API key
        if (originalEnv) {
            process.env['OPENAI_API_KEY'] = originalEnv
        } else {
            delete process.env['OPENAI_API_KEY']
        }
    })

    describe('constructor', () => {
        test('should initialize with valid config', () => {
            const provider = new OpenAIProvider(mockModelConfig)
            expect(provider).toBeInstanceOf(OpenAIProvider)
            expect(provider.getModelConfig()).toBe(mockModelConfig)
        })

        test('should throw if OPENAI_API_KEY is not set', () => {
            delete process.env['OPENAI_API_KEY']
            expect(() => new OpenAIProvider(mockModelConfig)).toThrow('OPENAI_API_KEY environment variable is not set')
        })
    })

    describe('getModelConfig', () => {
        test('should return the model configuration', () => {
            const provider = new OpenAIProvider(mockModelConfig)
            expect(provider.getModelConfig()).toBe(mockModelConfig)
        })
    })

    describe('complete', () => {
        test('should handle completion with default options', async () => {
            const provider = new OpenAIProvider(mockModelConfig)
            const result = await provider.complete('Test prompt')

            expect(result).toEqual(expect.objectContaining({
                content: expect.any(String),
                tokens: expect.objectContaining({
                    prompt: expect.any(Number),
                    completion: expect.any(Number),
                    total: expect.any(Number)
                }),
                model: mockModelConfig.id,
                finishReason: 'stop'
            }))
        })

        test('should handle completion with custom options', async () => {
            const provider = new OpenAIProvider(mockModelConfig)
            const options = {
                systemPrompt: 'You are a helpful assistant',
                temperature: 0.5,
                maxTokens: 100,
                format: 'text' as const
            }

            const result = await provider.complete('Test prompt', options)

            expect(result).toEqual(expect.objectContaining({
                content: expect.any(String),
                tokens: expect.objectContaining({
                    prompt: expect.any(Number),
                    completion: expect.any(Number),
                    total: expect.any(Number)
                }),
                model: mockModelConfig.id,
                finishReason: 'stop'
            }))
        })

        test('should handle empty prompt', async () => {
            const provider = new OpenAIProvider(mockModelConfig)
            await expect(provider.complete('')).resolves.toBeDefined()
        })

        test('should handle undefined options', async () => {
            const provider = new OpenAIProvider(mockModelConfig)
            await expect(provider.complete('Test prompt', undefined)).resolves.toBeDefined()
        })
    })

    describe('error handling', () => {
        test('should handle API errors', async () => {
            const provider = new OpenAIProvider(mockModelConfig)
            const mockError = new Error('API Error')

            // Mock the protected completeWithOptions method to throw an error
            vi.spyOn(provider as any, 'completeWithOptions').mockRejectedValue(mockError)

            await expect(provider.complete('Test prompt')).rejects.toThrow(mockError)
        })
    })

    describe('option handling', () => {
        test('should apply default options correctly', () => {
            const provider = new OpenAIProvider(mockModelConfig)
            const options = { prompt: 'Test prompt' }

            // Access protected method for testing
            const finalOptions = (provider as any).applyDefaultOptions(options)

            expect(finalOptions).toEqual({
                prompt: 'Test prompt',
                temperature: mockModelConfig.temperature,
                maxTokens: mockModelConfig.maxTokens,
                format: 'text'
            })
        })

        test('should preserve custom options', () => {
            const provider = new OpenAIProvider(mockModelConfig)
            const options = {
                prompt: 'Test prompt',
                temperature: 0.3,
                maxTokens: 500,
                format: 'json' as const
            }

            // Access protected method for testing
            const finalOptions = (provider as any).applyDefaultOptions(options)

            expect(finalOptions).toEqual(options)
        })
    })
}) 