/**
 * Type Definition Provider -- go-to-type-definition.
 * @module lsp/type-definition/provider
 */
import type { Location, Position } from "../types";
import { DefinitionProvider } from "../definition/provider";
import { DocumentSyncManager } from "../document-sync/manager";

export class TypeDefinitionProvider {
  private defProvider: DefinitionProvider;
  constructor(docManager: DocumentSyncManager) { this.defProvider = new DefinitionProvider(docManager); }
  getTypeDefinition(uri: string, position: Position): Location | Location[] | null { return this.defProvider.getDefinition(uri, position); }
}
export function createTypeDefinitionProvider(docManager: DocumentSyncManager): TypeDefinitionProvider { return new TypeDefinitionProvider(docManager); }
