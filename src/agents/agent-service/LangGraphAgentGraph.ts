import type { RunnableConfig } from '@langchain/core/runnables'
import { END, START, StateGraph } from '@langchain/langgraph'
import type { IModelService } from '@services/model/types.js'
import type { IPromptService } from '@services/prompt/types.js'
import type { IProviderService } from '@services/provider/types.js'
import type { ITaskService } from '@services/task/types.js'
import type { AgentGraphConfig, AgentGraphFactory, AgentGraphImplementation } from './AgentGraph.js'
import type { AgentNode } from './AgentNode.js'
import type { AgentState, NodeStatus } from './types.js'

/**
 * LangGraph implementation of the AgentGraph
 */
export class LangGraphAgentGraph<T extends AgentState<any, any, any>> implements AgentGraphImplementation<T> {
    private readonly graph: ReturnType<typeof StateGraph.prototype.compile>
    protected readonly taskService: ITaskService
    protected readonly providerService: IProviderService
    protected readonly modelService: IModelService
    protected readonly promptService: IPromptService
    protected debug: boolean = false

    constructor(
        nodes: Record<string, AgentNode<T>>,
        edges: Array<[string, string]>,
        startNode: string,
        taskService: ITaskService,
        providerService: IProviderService,
        modelService: IModelService,
        promptService: IPromptService
    ) {
        this.taskService = taskService
        this.providerService = providerService
        this.modelService = modelService
        this.promptService = promptService

        // Create LangGraph StateGraph
        this.graph = this.createGraph(nodes, edges, startNode)
    }

    /**
     * Creates a LangGraph StateGraph
     */
    private createGraph(
        nodes: Record<string, AgentNode<T>>,
        edges: Array<[string, string]>,
        startNode: string
    ) {
        // Define channels for state management
        const channels = this.createStateChannels()

        // Cast our types to make them compatible with LangGraph
        // This is necessary because LangGraph expects specific state types
        const stateGraph = new StateGraph({
            channels,
        } as any)

        // Add all nodes to the graph, converting node handlers as needed
        Object.entries(nodes).forEach(([nodeId, agentNode]) => {
            const nodeHandler = async (state: any, _context: any) => {
                try {
                    // Update status to entering node
                    const enteringStatus: NodeStatus = {
                        nodeId,
                        status: 'entering',
                        timestamp: new Date().toISOString()
                    };
                    const stateWithEnteringStatus = {
                        ...state,
                        status: {
                            ...state.status,
                            currentNode: nodeId,
                            nodeHistory: [...state.status.nodeHistory, enteringStatus],
                            overallStatus: 'running'
                        }
                    };

                    // Run the node
                    return await this.nodeHandler(stateWithEnteringStatus, nodeId, agentNode)
                } catch (error) {
                    // Create error status
                    const errorStatus: NodeStatus = {
                        nodeId,
                        status: 'error',
                        details: error instanceof Error ? error.message : String(error),
                        timestamp: new Date().toISOString()
                    };

                    // Return error state
                    return {
                        ...state,
                        status: {
                            ...state.status,
                            overallStatus: 'error',
                            nodeHistory: [...(state.status.nodeHistory || []), errorStatus]
                        },
                        errors: {
                            errors: [...state.errors.errors, String(errorStatus.details)],
                            errorCount: state.errors.errorCount + 1
                        }
                    };
                }
            };
            stateGraph.addNode(nodeId, nodeHandler as any);
        })

        // Connect start node - using constants directly to satisfy type checking
        stateGraph.addEdge(START as any, startNode as any)

        // Add all edges
        edges.forEach(([fromNode, toNode]) => {
            if (toNode === 'END') {
                stateGraph.addEdge(fromNode as any, END as any)
            } else {
                stateGraph.addEdge(fromNode as any, toNode as any)
            }
        })

        return stateGraph.compile()
    }

    /**
     * Creates state channels for the LangGraph
     */
    private createStateChannels() {
        return {
            config: { reducer: (a: any, b: any) => ({ ...a, ...b }) },
            agentRun: { reducer: (a: any, b: any) => ({ ...a, ...b }) },
            status: { reducer: (_: any, b: any) => b },
            logs: {
                reducer: (a: any, b: any) => {
                    const prevLogs = a || { logs: [], logCount: 0 }
                    const newLogs = b || { logs: [], logCount: 0 }
                    return {
                        logs: [...prevLogs.logs, ...newLogs.logs],
                        logCount: prevLogs.logCount + newLogs.logCount
                    }
                }
            },
            errors: {
                reducer: (a: any, b: any) => {
                    const prevErrors = a || { errors: [], errorCount: 0 }
                    const newErrors = b || { errors: [], errorCount: 0 }
                    return {
                        errors: [...prevErrors.errors, ...newErrors.errors],
                        errorCount: prevErrors.errorCount + newErrors.errorCount
                    }
                }
            },
            input: { reducer: (a: any, b: any) => ({ ...a, ...b }) },
            output: { reducer: (a: any, b: any) => ({ ...a, ...b }) },
            agentState: { reducer: (a: any, b: any) => ({ ...a, ...b }) }
        }
    }

    /**
     * Converts AgentGraphConfig to LangGraph RunnableConfig
     */
    private convertConfigToRunnableConfig(config?: AgentGraphConfig): RunnableConfig | undefined {
        if (!config) return undefined

        // Create a LangGraph compatible RunnableConfig
        return {
            configurable: {
                ...config
            }
        }
    }

    /**
     * Creates a runnable function that executes the entire graph
     */
    public runnable(): (state: T, config?: AgentGraphConfig) => Promise<T> {
        return async (state: T, config?: AgentGraphConfig): Promise<T> => {
            try {
                // Apply config overrides if provided
                const debugEnabled = config?.debug !== undefined ? config.debug : this.debug

                if (debugEnabled) {
                    console.log(`[LangGraphAgentGraph] Starting graph execution`)
                }

                // Initialize state with run information
                const startTime = new Date().toISOString()
                const runId = crypto.randomUUID()

                const initialState = {
                    ...state,
                    agentRun: {
                        ...state.agentRun,
                        runId,
                        startTime,
                        description: 'Executing LangGraph agent',
                        completedSteps: []
                    },
                    logs: {
                        ...state.logs,
                        logs: [...state.logs.logs, 'Starting LangGraph execution'],
                        logCount: state.logs.logCount + 1
                    }
                } as T

                // Convert our config to RunnableConfig for LangGraph
                const runnableConfig = this.convertConfigToRunnableConfig(config)

                // Execute the graph
                const result = await this.graph.invoke(initialState, runnableConfig)

                if (debugEnabled) {
                    console.log(`[LangGraphAgentGraph] Completed graph execution`)
                }

                return result as T
            } catch (error) {
                console.error(`[LangGraphAgentGraph] Error in graph execution:`, error)
                const errorMessage = error instanceof Error ? error.message : String(error)

                return {
                    ...state,
                    status: {
                        ...state.status,
                        overallStatus: 'error'
                    },
                    errors: {
                        ...state.errors,
                        errors: [...state.errors.errors, errorMessage],
                        errorCount: state.errors.errorCount + 1
                    },
                    logs: {
                        ...state.logs,
                        logs: [...state.logs.logs, `Error in graph execution: ${errorMessage}`],
                        logCount: state.logs.logCount + 1
                    }
                } as T
            }
        }
    }

    /**
     * Enables debug mode for detailed logging
     */
    public setDebug(enabled: boolean): void {
        this.debug = enabled
    }

    private async nodeHandler<T extends AgentState<any, any, any>>(
        state: T,
        nodeId: string,
        node: AgentNode<T>
    ): Promise<T> {
        try {
            // Initialize nodeHistory if it doesn't exist
            if (!state.status.nodeHistory) {
                state.status.nodeHistory = []
            }

            // Execute the node
            const result = await node.execute(state)

            // Return result directly since node.execute already handles status updates
            return result
        } catch (error) {
            // Create error status
            const errorStatus: NodeStatus = {
                nodeId,
                status: 'error',
                details: error instanceof Error ? error.message : String(error),
                timestamp: new Date().toISOString()
            };

            // Return error state
            return {
                ...state,
                status: {
                    ...state.status,
                    overallStatus: 'error',
                    nodeHistory: [...(state.status.nodeHistory || []), errorStatus]
                },
                errors: {
                    errors: [...state.errors.errors, String(errorStatus.details)],
                    errorCount: state.errors.errorCount + 1
                }
            }
        }
    }
}

/**
 * LangGraph factory implementation
 */
export class LangGraphAgentGraphFactory implements AgentGraphFactory {
    public createAgentGraph<T extends AgentState<any, any, any>>(
        graph: Record<string, { node: AgentNode<T>, next: Array<string> }>,
        startNode: string,
        taskService: ITaskService,
        providerService: IProviderService,
        modelService: IModelService,
        promptService: IPromptService
    ): AgentGraphImplementation<T> {
        // Extract nodes and edges from the graph definition
        const nodes: Record<string, AgentNode<T>> = {}
        const edges: Array<[string, string]> = []

        // Process graph definition to extract nodes and edges
        Object.entries(graph).forEach(([nodeId, { node, next }]) => {
            // Add node
            nodes[nodeId] = node

            // Add edges
            next.forEach(nextNodeId => {
                edges.push([nodeId, nextNodeId])
            })
        })

        return new LangGraphAgentGraph<T>(
            nodes,
            edges,
            startNode,
            taskService,
            providerService,
            modelService,
            promptService
        )
    }
}

/**
 * Create a new LangGraph implementation of AgentGraph
 */
export function createLangGraphAgentGraph<T extends AgentState<any, any, any>>(
    graph: Record<string, { node: AgentNode<T>, next: Array<string> }>,
    startNode: string,
    taskService: ITaskService,
    providerService: IProviderService,
    modelService: IModelService,
    promptService: IPromptService
): AgentGraphImplementation<T> {
    const factory = new LangGraphAgentGraphFactory()
    return factory.createAgentGraph(
        graph,
        startNode,
        taskService,
        providerService,
        modelService,
        promptService
    )
} 