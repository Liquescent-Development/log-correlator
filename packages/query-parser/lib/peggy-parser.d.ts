import { ParsedQuery, StreamQuery } from "./parser";
interface LabelMapping {
  left: string;
  right: string;
}
interface ParsedQueryExtended extends ParsedQuery {
  labelMappings?: LabelMapping[];
  filter?: string;
  additionalStreams?: StreamQuery[];
}
export declare class PeggyQueryParser {
  parse(query: string): ParsedQueryExtended;
  private transformParseResult;
  validate(query: string): {
    valid: boolean;
    error?: string;
    details?: any;
  };
  /**
   * Get syntax suggestions for autocomplete at a given position
   */
  getSuggestions(query: string, position: number): string[];
  /**
   * Format a query with proper indentation
   */
  formatQuery(query: string): string;
}
export declare class NearleyQueryParser {}
export {};
//# sourceMappingURL=peggy-parser.d.ts.map
