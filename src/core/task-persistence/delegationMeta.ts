/**
 * Delegation metadata persistence.
 * Stores parent→child task delegation info for crash recovery.
 */

import * as vscode from "vscode"

interface DelegationMeta {
	parentTaskId: string
	childTaskId: string
	completionResultSummary?: string
	savedAt: string
}

export async function saveDelegationMeta(
	storageUri: vscode.Uri,
	parentTaskId: string,
	childTaskId: string,
	completionResultSummary?: string,
): Promise<void> {
	// Stub — full implementation pending upstream sync
}

export async function readDelegationMeta(
	storageUri: vscode.Uri,
	parentTaskId: string,
): Promise<DelegationMeta | undefined> {
	return undefined
}

export async function clearDelegationMeta(
	storageUri: vscode.Uri,
	parentTaskId: string,
): Promise<void> {
	// Stub
}
