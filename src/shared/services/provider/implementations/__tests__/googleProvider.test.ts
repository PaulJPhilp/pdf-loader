import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { ModelConfig } from '../../../model/schemas/modelConfig.js'
import { GoogleProvider } from '../googleProvider.js'

describe('GoogleProvider', () => {
    const mockModelConfig: ModelConfig = {
        id: 'gemini-pro',
        modelName: 'gemini-pro',
        provider: 'google',
        maxTokens: 32768,
        temperature: 0.7,
        contextWindowSize: 'large',
        capabilities: ['text-generation'],
        description: 'Gemini Pro model'
    }

    // Store original env
    const originalEnv = process.env['GOOGLE_API_KEY']

    beforeEach(() => {
        // Set up test API key
        process.env['GOOGLE_API_KEY'] = 'test-api-key'
        vi.clearAllMocks()
    })

    afterEach(() => {
        // Restore original API key
        if (originalEnv) {
            process.env['GOOGLE_API_KEY'] = originalEnv
        } else {
            delete process.env['GOOGLE_API_KEY']
        }
    })

    describe('constructor', () => {
        test('should initialize with valid config', () => {
            const provider = new GoogleProvider(mockModelConfig)
            expect(provider).toBeInstanceOf(GoogleProvider)
            expect(provider.getModelConfig()).toBe(mockModelConfig)
        })

        test('should throw if GOOGLE_API_KEY is not set', () => {
            delete process.env['GOOGLE_API_KEY']
            expect(() => new GoogleProvider(mockModelConfig)).toThrow('GOOGLE_API_KEY environment variable is not set')
        })
    })

    describe('getModelConfig', () => {
        test('should return the model configuration', () => {
            const provider = new GoogleProvider(mockModelConfig)
            expect(provider.getModelConfig()).toBe(mockModelConfig)
        })
    })

    describe('complete', () => {
        test('should handle completion with default options', async () => {
            const provider = new GoogleProvider(mockModelConfig)
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
            const provider = new GoogleProvider(mockModelConfig)
            const options = {
                systemPrompt: 'You are Gemini Pro, a helpful AI assistant',
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
            const provider = new GoogleProvider(mockModelConfig)
            await expect(provider.complete('')).resolves.toBeDefined()
        })

        test('should handle undefined options', async () => {
            const provider = new GoogleProvider(mockModelConfig)
            await expect(provider.complete('Test prompt', undefined)).resolves.toBeDefined()
        })
    })

    describe('error handling', () => {
        test('should handle API errors', async () => {
            const provider = new GoogleProvider(mockModelConfig)
            const mockError = new Error('API Error')

            // Mock the protected completeWithOptions method to throw an error
            vi.spyOn(provider as any, 'completeWithOptions').mockRejectedValue(mockError)

            await expect(provider.complete('Test prompt')).rejects.toThrow(mockError)
        })
    })

    describe('option handling', () => {
        test('should apply default options correctly', () => {
            const provider = new GoogleProvider(mockModelConfig)
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
            const provider = new GoogleProvider(mockModelConfig)
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