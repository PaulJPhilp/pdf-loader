import { generateText } from "ai";
import type { ModelConfig } from "../../model/schemas/modelConfig.js";
import type {
    HandlerConfig,
    ImageGenerationOptions, ImageGenerationResponse,
    ModelCompletionOptions, ModelCompletionResponse,
    RunnableTask
} from "../modelProvider.js";
import { BaseModelProvider } from "../modelProvider.js";
import { anthropic, createAnthropic } from "@ai-sdk/anthropic";

/**
 * Provider implementation for Anthropic models
 */
export class AnthropicProvider extends BaseModelProvider {
    private apiKey: string;
    private anthropicProvider: ReturnType<typeof createAnthropic>;

    /**
     * Creates a new AnthropicProvider instance
     * @param modelConfig - Configuration for the model
     */
    constructor(modelConfig: ModelConfig) {
        super(modelConfig);
        
        // Get API key from environment variables
        const apiKey = process.env.ANTHROPIC_API_KEY;
        
        if (!apiKey) {
            throw new Error(
                'ANTHROPIC_API_KEY environment variable is not set'
            );
        }
        
        this.apiKey = apiKey;
        
        // Initialize the Anthropic provider with API key
        this.anthropicProvider = createAnthropic({
            apiKey: this.apiKey
        });
    }

    /**
         * Complete a prompt with the model
         * Implements the abstract method from BaseModelProvider
         */
    public async complete(
        options: ModelCompletionOptions
    ): Promise<ModelCompletionResponse> {
        const taskId = new Date().toISOString();
        if (this.debug) {
            console.log(`[ANTHROPIC][${taskId}] Completing prompt with model ${this.modelConfig.id}`);
        }

        const handlerConfig: HandlerConfig = {
            retries: 0,
            maxRetries: options.maxRetries ?? 4,
            error: null,
            options: options,
        };

        const completeTask: RunnableTask = async (opts) => {
            if (this.debug) {
                console.log(`[ANTHROPIC][${taskId}] Running task with model ${this.modelConfig.id}`);
            }
            const optionsWithDefaults = this.applyDefaultOptions(opts);
            const response = generateText({
                model: anthropic(this.modelConfig.id),
                prompt: optionsWithDefaults.prompt,
                temperature: optionsWithDefaults.temperature ?? 0.2,
                maxRetries: 0 // We'll handle retries ourselves
            });
            if (this.debug) {
                console.log(`[ANTHROPIC][${taskId}] Task completed with model ${this.modelConfig.id}`);
            }
            return this.wrapResponse(await response);
        };

        // Leverage the runTask method to ensure validation and retry logic
        const result = await this.runTask(completeTask, handlerConfig);
        return result;
    }/**
     

    /**
     * Generate an image with the given model
     */
    public async generateImage(
        options: ImageGenerationOptions
    ): Promise<ImageGenerationResponse> {
        // Anthropic doesn't support image generation yet, so throw an error
        throw new Error("Image generation not supported by Anthropic models");
    }
}
