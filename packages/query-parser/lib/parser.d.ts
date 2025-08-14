export type JoinType = 'and' | 'or' | 'unless';
export interface StreamQuery {
    source: string;
    selector: string;
    timeRange: string;
    alias?: string;
}
interface LabelMapping {
    left: string;
    right: string;
}
export interface ParsedQuery {
    leftStream: StreamQuery;
    rightStream: StreamQuery;
    joinType: JoinType;
    joinKeys: string[];
    timeWindow?: string;
    temporal?: string;
    grouping?: {
        side: 'left' | 'right';
        labels: string[];
    };
    ignoring?: string[];
    labelMappings?: Array<{
        left: string;
        right: string;
    }>;
    filter?: string;
    additionalStreams?: StreamQuery[];
}
interface ParsedQueryExtended extends ParsedQuery {
    labelMappings?: LabelMapping[];
    filter?: string;
    additionalStreams?: StreamQuery[];
}
export declare class QueryParser {
    parse(query: string): ParsedQueryExtended;
    private extractAllStreams;
    private extractAlias;
    private extractJoinOperations;
    private extractModifier;
    private extractGrouping;
    private parseJoinKeys;
    private parseStreamQuery;
    validate(query: string): {
        valid: boolean;
        error?: string;
        details?: any;
    };
}
export declare class QueryBuilder {
    private query;
    addStream(source: string, selector: string, timeRange: string): this;
    join(type: JoinType, keys: string[]): this;
    withTemporal(window: string): this;
    withGrouping(side: 'left' | 'right', labels?: string[]): this;
    andStream(source: string, selector: string, timeRange: string): this;
    build(): string;
}
export {};
//# sourceMappingURL=parser.d.ts.map