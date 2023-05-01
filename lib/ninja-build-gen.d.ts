/// <reference types="node" />
import * as fs from 'fs';
export declare function escape(s: string): string;
declare class NinjaAssignBuilder {
    private readonly name;
    private readonly value;
    constructor(name: string | number, value: string | number);
    write(stream: {
        write: (arg0: string) => void;
    }): void;
}
declare class NinjaEdgeBuilder {
    private readonly targets;
    private readonly assigns;
    private rule;
    private sources?;
    private dependencies?;
    private orderDeps?;
    private _pool?;
    constructor(targets: string | Array<string>);
    using(rule: string): this;
    from(sources: string | Array<string>): this;
    need(dependencies: string | Array<string>): this;
    after(orderDeps: string | Array<string>): this;
    assign(name: number | string, value: number | string): this;
    pool(pool: string): this;
    write(stream: {
        write: (arg0: string) => void;
    }): void;
}
declare class NinjaRuleBuilder {
    private readonly name;
    private command;
    private desc?;
    private dependencyFile?;
    private doRestat?;
    private isGenerator?;
    private _pool?;
    constructor(name: string);
    run(command: string): this;
    description(desc: string): this;
    depfile(file: string): this;
    restat(doRestat: boolean): this;
    generator(isGenerator: boolean): this;
    pool(pool: string): this;
    write(stream: {
        write: (arg0: string) => void;
    }): void;
}
export declare class NinjaBuilder {
    private readonly version?;
    private readonly buildDir?;
    private readonly edges;
    private readonly rules;
    private readonly variables;
    private _edgeCount;
    private _ruleCount;
    private headerValue?;
    private defaultRule?;
    constructor(version?: string, buildDir?: string);
    get edgeCount(): number;
    get ruleCount(): number;
    header(value: string): this;
    byDefault(name: string): this;
    assign(name: string | number, value: string | number): NinjaAssignBuilder;
    rule(name: string): NinjaRuleBuilder;
    edge(targets: string | Array<string>): NinjaEdgeBuilder;
    saveToStream(stream: {
        write: (arg0: string) => void;
    }): void;
    save(path: string, callback?: () => void): fs.WriteStream;
}
declare function factory(version?: string, builddir?: string): NinjaBuilder;
declare namespace factory {
    var escape: typeof import("./ninja-build-gen").escape;
}
export default factory;
