// Minimal Type Definitions for SehawqDB
// Keeps it simple, human-like, and usable.

export = SehawqDB;

declare class SehawqDB {
    constructor(options?: SehawqDB.Options);

    // Core
    start(): Promise<void>;
    stop(): Promise<void>;

    // Data Ops
    set(key: string, value: any, opts?: { ttl?: number }): this;
    get(key: string): any;
    delete(key: string): boolean;
    has(key: string): boolean;
    all(): Record<string, any>;
    clear(): Promise<this>;

    // Query
    find(filterFn: (value: any, key?: string) => boolean): SehawqDB.QueryResult;
    where(field: string, operator: SehawqDB.Operator, value: any): SehawqDB.QueryResult;

    // Aggregations
    count(filterFn?: Function): number;
    sum(field: string, filterFn?: Function): number;
    avg(field: string, filterFn?: Function): number;
    min(field: string, filterFn?: Function): number;
    max(field: string, filterFn?: Function): number;

    // Indexing
    createIndex(field: string, type?: 'hash' | 'range' | 'text'): Promise<void>;
    dropIndex(field: string): boolean;

    // Collections (MongoDB-style)
    collection(name: string): SehawqDB.Collection;

    // Reactive Watchers (Firebase-style)
    watch(key: string, callback: (newVal: any, oldVal: any) => void): void;
    unwatch(key: string, callback?: Function): void;

    // Migrations
    migrate(version: number, name: string, fn: (db: any) => Promise<void>): this;
    runMigrations(): Promise<number>;
    migrationStatus(): SehawqDB.MigrationStatus;

    // Plugin System
    use(plugin: Function, opts?: Record<string, any>): this;

    // Replication
    replicationStatus(): SehawqDB.ReplicationStatus | null;

    // Audit
    auditLog(filter?: { action?: string; key?: string; user?: string; limit?: number }): Promise<any[]>;

    // GDPR / Compliance
    gdprExport(userId: string): Promise<{ userId: string; recordCount: number; data: Record<string, any> }>;
    gdprDelete(userId: string): Promise<{ userId: string; deletedRecords: number }>;
    gdprAnonymize(userId: string): Promise<{ userId: string; anonymizedRecords: number }>;
    complianceReport(): { totalRecords: number; recordsWithOwner: number; recordsWithoutOwner: number; uniqueOwners: number; piiFieldsFound: string[] };

    // Utils
    push(key: string, value: any): number;
    pull(key: string, value: any): boolean;
    add(key: string, number: number): number;
    subtract(key: string, number: number): number;

    // Stats
    getStats(): object;
}

declare namespace SehawqDB {
    export interface Options {
        path?: string;
        autoSave?: boolean;
        saveInterval?: number;
        cache?: boolean;
        cacheLimit?: number;
        enableServer?: boolean;
        serverPort?: number;
        enableRealtime?: boolean;
        debug?: boolean;
        replication?: ReplicationOptions;
        [key: string]: any;
    }

    export interface ReplicationOptions {
        role: 'primary' | 'replica';
        nodes?: string[];
        syncInterval?: number;
    }

    export interface ReplicationStatus {
        role: string;
        nodeCount: number;
        nodes: Record<string, { alive: boolean; lastPing: number; fails: number }>;
        buffered: number;
    }

    export type Operator = '=' | '!=' | '>' | '<' | '>=' | '<=' | 'in' | 'contains' | 'startsWith' | 'endsWith';

    export interface MigrationStatus {
        current: number;
        pending: number;
        history: Array<{ version: number; name: string; applied_at: number }>;
    }

    export interface SchemaRule {
        type?: 'string' | 'number' | 'boolean' | 'array' | 'object';
        required?: boolean;
        min?: number;
        max?: number;
        enum?: any[];
        pattern?: string | RegExp;
    }

    export class Collection {
        insert(doc: object): Promise<string>;
        insertMany(docs: object[]): Promise<string[]>;
        find(query?: object): any[];
        findOne(query?: object): any | null;
        update(query: object, changes: object): Promise<boolean>;
        updateMany(query: object, changes: object): Promise<number>;
        remove(query: object): Promise<boolean>;
        removeMany(query: object): Promise<number>;
        count(query?: object): number;
        drop(): Promise<void>;
        schema(rules: Record<string, SchemaRule>): this;
    }

    export class QueryResult {
        sort(field: string): this;
        limit(n: number): this;
        skip(n: number): this;
        toArray(): any[];
        first(): any;
        last(): any;
        count(): number;
    }
}
