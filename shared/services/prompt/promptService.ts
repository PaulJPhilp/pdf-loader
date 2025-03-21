interface ProfileData {
    readonly id: string;
    readonly name?: string;
    readonly description?: string;
    readonly attributes?: Record<string, string | number | boolean>;
}

interface TemplateIdentifier {
    readonly templateName: string;
}

interface TaskIdentifier {
    readonly taskName: string;
}

class PromptError extends Error {
    readonly code: string;
    readonly templateName?: string;
    readonly taskName?: string;

    constructor(message: string, details: {
        readonly templateName?: string;
        readonly taskName?: string;
    }) {
        super(message);
        this.name = 'PromptError';
        this.code = 'PROMPT_ERROR';
        this.templateName = details.templateName;
        this.taskName = details.taskName;
    }
}
import { ModelService } from '../model/modelService.js';
import type { ModelCompletionOptions } from '../provider/modelProvider.js';
import type { PromptVariables } from './prompt.js';
import { PromptTemplateService } from './promptTemplate.js';

/**
 * Options for prompt generation
 */
export interface PromptOptions {
    readonly systemPrompt?: string;
    readonly temperature?: number;
    readonly maxTokens?: number;
}

interface PromptServiceOptions {
    readonly configPath: string;
}

/**
 * Service for managing and generating prompts
 */
export class PromptService {
    readonly debug: boolean = false;
    private readonly modelService: ModelService;
    private readonly templateService: PromptTemplateService;

    constructor(options: PromptServiceOptions) {
        if (this.debug) {
            console.log(`[PromptService] Initializing with config path: ${options.configPath}`);
        }
        this.modelService = new ModelService({ configPath: options.configPath });
        this.templateService = new PromptTemplateService({ promptPath: options.configPath });
    }

    private createPromptError(message: string, details: {
        readonly templateName?: string;
        readonly taskName?: string;
    }): PromptError {
        return new PromptError(message, details);
    }

    /**
     * Generate a prompt from a template
     */
    public async generatePrompt(
        { templateName }: TemplateIdentifier,
        variables: PromptVariables,
        options: PromptOptions = {}
    ): Promise<string> {
        if (this.debug) {
            console.log(`[PromptService] Generating prompt for template: ${templateName}`);
        }
        const template = this.templateService.getTemplate({ templateName });
        if (!template) {
            throw this.createPromptError(
                'Template not found',
                { templateName }
            );
        }

        const prompt = this.templateService.buildPrompt({ templateName }, variables);
        if (!prompt) {
            throw this.createPromptError(
                'Failed to build prompt',
                { templateName }
            );
        }
        return prompt;
    }

    /**
     * Complete a prompt using the appropriate model
     */
    public async completePrompt(
        modelId: string,
        prompt: string,
        options: PromptOptions = {}
    ): Promise<string> {
        if (this.debug) {
            console.log(`[PromptService] Completing prompt for model: ${modelId}`);
        }
        const completionOptions: ModelCompletionOptions = {
            prompt,
            systemPrompt: options.systemPrompt,
            temperature: options.temperature,
            maxTokens: options.maxTokens
        };

        const result = await this.modelService.completeWithModel(
            { modelId },
            completionOptions
        );

        if (!result?.text) {
            throw this.createPromptError(
                'Model completion failed',
                { templateName: modelId }
            );
        }

        return result.text;
    }

    /**
     * Complete clustering task for persona generation
     */
    public async completeClustering(
        profiles: readonly ProfileData[],
        options: PromptOptions = {}
    ): Promise<string> {
        return this.generatePrompt(
            { templateName: 'clustering' },
            {
                profiles: JSON.stringify(profiles, null, 2)
            },
            {
                systemPrompt: options.systemPrompt ??
                    'You are an expert data analyst specializing in ' +
                    'user behavior clustering and pattern recognition.',
                ...options
            }
        );
    }
} 