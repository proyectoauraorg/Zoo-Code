import axios from "axios"
import { z } from "zod"

import type { ModelInfo } from "@roo-code/types"
import { opencodeGoDefaultModelInfo } from "@roo-code/types"

const OPENCODE_GO_BASE_URL = "https://opencode.ai/zen/go/v1"

// The Opencode Go `/models` endpoint follows the OpenAI `/models` shape. The
// `id` is the only guaranteed field; metadata is optional and best-effort, so
// the schema is intentionally permissive. Pricing is intentionally NOT parsed:
// the units returned by the endpoint aren't documented, and reporting a wrong
// cost is worse than reporting "unknown" — so cost stays undefined until the
// pricing shape is confirmed against the live endpoint.
const opencodeGoModelSchema = z.object({
	id: z.string(),
	name: z.string().optional(),
	description: z.string().optional(),
	context_window: z.number().optional(),
	context_length: z.number().optional(),
	max_tokens: z.number().optional(),
	max_output_tokens: z.number().optional(),
	supports_images: z.boolean().optional(),
})

export type OpencodeGoModel = z.infer<typeof opencodeGoModelSchema>

const opencodeGoModelsResponseSchema = z.object({
	data: z.array(opencodeGoModelSchema),
})

export const parseOpencodeGoModel = (model: OpencodeGoModel): ModelInfo => ({
	maxTokens: model.max_output_tokens ?? model.max_tokens ?? opencodeGoDefaultModelInfo.maxTokens,
	contextWindow: model.context_window ?? model.context_length ?? opencodeGoDefaultModelInfo.contextWindow,
	supportsImages: model.supports_images ?? false,
	supportsPromptCache: false,
	description: model.description ?? model.name,
})

export async function getOpencodeGoModels(apiKey?: string): Promise<Record<string, ModelInfo>> {
	const models: Record<string, ModelInfo> = {}

	try {
		const response = await axios.get(`${OPENCODE_GO_BASE_URL}/models`, {
			headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
		})

		const result = opencodeGoModelsResponseSchema.safeParse(response.data)
		const data = result.success ? result.data.data : (response.data?.data ?? [])

		if (!result.success) {
			console.error(`Opencode Go models response is invalid: ${JSON.stringify(result.error.format())}`)
		}

		for (const model of data) {
			if (model?.id) {
				models[model.id] = parseOpencodeGoModel(model)
			}
		}
	} catch (error) {
		console.error(`Error fetching Opencode Go models: ${error instanceof Error ? error.message : String(error)}`)
	}

	return models
}
