/**
 * Declaration Provider -- go-to-declaration.
 * @module lsp/declaration/provider
 */
import type { Location, Position } from "../types";
import { DefinitionProvider } from "../definition/provider";
import { DocumentSyncManager } from "../document-sync/manager";

export class DeclarationProvider {
  private defProvider: DefinitionProvider;
  constructor(docManager: DocumentSyncManager) { this.defProvider = new DefinitionProvider(docManager); }
  getDeclaration(uri: string, position: Position): Location | Location[] | null { return this.defProvider.getDefinition(uri, position); }
}
export function createDeclarationProvider(docManager: DocumentSyncManager): DeclarationProvider { return new DeclarationProvider(docManager); }
