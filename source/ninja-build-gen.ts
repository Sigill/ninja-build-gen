// # Ninja-build Generator
//
// This library exports a set of functions to build a Ninja file
// programmatically.

import * as fs from 'fs';

// Escape a string, like a path, to be suitable for Ninja.
// This is to be called explicitely because the user may want to use
// variables like `$foo` in paths, rules, etc.
export function escape(s: string): string {
    return s.replace(/[ :$]/g, (match: string) => '$' + match);
}

// Represent a Ninja variable assignation (it's more a binding, actually).
class NinjaAssignBuilder {
    constructor(private readonly name: string | number, private readonly value: string | number) {}

    // Write the assignation into a `stream`.
    write(stream: { write: (arg0: string) => void; }) {
        return stream.write(`${this.name} = ${this.value}\n`);
    }
}

// Represent a Ninja edge, that is, "how to construct this file X from Y".
class NinjaEdgeBuilder {
    private readonly targets: Array<string>;
    private readonly assigns: { [P in number | string]: number | string; } = {};
    private rule = 'phony';
    private sources?: Array<string>;
    private dependencies?: Array<string>;
    private orderDeps?: Array<string>;
    private _pool?: string;

    // Construct an edge specifing the resulting files, as `targets`, of the
    // edge.
    constructor(targets: string | Array<string>) {
        if (typeof targets === 'string') {
            this.targets = [targets];
        } else {
            this.targets = targets;
        }
    }

    // Define the Ninja `rule` name to use to build this edge.
    using(rule: string) {
        this.rule = rule;
        return this;
    }

    // Define one or several direct `sources`, that is, files to be transformed
    // by the rule.
    from(sources: string | Array<string>) {
        this.sources ??= [];
        if (typeof sources === 'string') {
            this.sources.push(sources);
        } else {
            this.sources.push(...sources);
        }
        return this;
    }

    // Define one or several indirect `dependencies`, that is, files needed but
    // not part of the compilation or transformation.
    need(dependencies: string | Array<string>) {
        this.dependencies ??= [];
        if (typeof dependencies === 'string') {
            this.dependencies.push(dependencies);
        } else {
            this.dependencies.push(...dependencies);
        }
        return this;
    }

    // Define one or several order-only dependencies in `orderDeps`, that is,
    // this edge should be build after those dependencies are.
    after(orderDeps: string | Array<string>) {
        this.orderDeps ??= [];
        if (typeof orderDeps === 'string') {
            this.orderDeps.push(orderDeps);
        } else {
            this.orderDeps.push(...orderDeps);
        }
        return this;
    }

    // Bind a variable to a temporary value for the edge.
    assign(name: number | string, value: number | string) {
        this.assigns[name] = value;
        return this;
    }

    // Assign this edge to a pool.
    // See https://ninja-build.org/manual.html#ref_pool
    pool(pool: string) {
        this._pool = pool;
        return this;
    }

    // Write the edge into a `stream`.
    write(stream: { write: (arg0: string) => void; }) {
        stream.write(`build ${this.targets.join(' ')}: ${this.rule}`);
        if (this.sources !== undefined) {
            stream.write(' ' + this.sources.join(' '));
        }
        if (this.dependencies !== undefined) {
            stream.write(' | ' + this.dependencies.join(' '));
        }
        if (this.orderDeps !== undefined) {
            stream.write(' || ' + this.orderDeps.join(' '));
        }
        for (const [name, value] of Object.entries(this.assigns)) {
            stream.write(`\n  ${name} = ${value}`);
        }
        stream.write('\n');
        if (this._pool !== undefined) {
            return stream.write(`  pool = ${this._pool}\n`);
        }
    }
}

// Represent a Ninja rule, that is, a method to "how I build a file of type A
// to type B".
class NinjaRuleBuilder {
    private command = '';
    private desc?: string;
    private dependencyFile?: string;
    private doRestat?: boolean;
    private isGenerator?: boolean;
    private _pool?: string;

    // Create a rule with this `name`.
    constructor(private readonly name: string) {
    }

    // Specify the command-line to run to execute the rule.
    run(command: string) {
        this.command = command;
        return this;
    }

    // Provide a description, displayed by Ninja instead of the bare command-
    // line.
    description(desc: string) {
        this.desc = desc;
        return this;
    }

    // Provide a Makefile-compatible dependency file for the rule products.
    depfile(file: string) {
        this.dependencyFile = file;
        return this;
    }

    restat(doRestat: boolean) {
        this.doRestat = doRestat;
        return this;
    }

    generator(isGenerator: boolean) {
        this.isGenerator = isGenerator;
        return this;
    }

    pool(pool: string) {
        this._pool = pool;
        return this;
    }

    // Write the rule into a `stream`.
    write(stream: { write: (arg0: string) => void; }) {
        stream.write(`rule ${this.name}\n  command = ${this.command}\n`);

        if (this.desc != null) {
            stream.write(`  description = ${this.desc}\n`);
        }
        if (this.doRestat) {
            stream.write("  restat = 1\n");
        }
        if (this.isGenerator) {
            stream.write("  generator = 1\n");
        }
        if (this._pool != null) {
            stream.write(`  pool = ${this._pool}\n`);
        }
        if (this.dependencyFile != null) {
            stream.write(`  depfile = ${this.dependencyFile}\n`);
            return stream.write("  deps = gcc\n");
        }
    }
}

// Provide helpers to build a Ninja file by specifing high-level rules and
// targets.
export class NinjaBuilder {
    private readonly version?: string;
    private readonly buildDir?: string;
    private readonly edges: Array<NinjaEdgeBuilder> = [];
    private readonly rules: Array<NinjaRuleBuilder> = [];
    private readonly variables: Array<NinjaAssignBuilder> = []
    private _edgeCount = 0;
    private _ruleCount = 0;
    private headerValue?: string;
    private defaultRule?: string;

    // Create the builder, specifing an optional required Ninja `version`, and a
    // build directory (where Ninja put logs and where you can put
    // intermediary products).
    constructor(version?: string, buildDir?: string) {
        this.version = version;
        this.buildDir = buildDir;
    }

    get edgeCount() { return this._edgeCount; }
    get ruleCount() { return this._ruleCount; }

    // Set an arbitrary header.
    header(value: string) {
        this.headerValue = value;
        return this;
    }

    // Specify the default rule by its `name`.
    byDefault(name: string) {
        this.defaultRule = name;
        return this;
    }

    // Add a variable assignation into `name` from the `value`.
    assign(name: string | number, value: string | number) {
        const clause = new NinjaAssignBuilder(name, value);
        this.variables.push(clause);
        return clause;
    }

    // Add a rule and return it.
    rule(name: string) {
        const clause = new NinjaRuleBuilder(name);
        this.rules.push(clause);
        this._ruleCount++;
        return clause;
    }

    // Add an edge and return it.
    edge(targets: string | Array<string>) {
        const clause = new NinjaEdgeBuilder(targets);
        this.edges.push(clause);
        this._edgeCount++;
        return clause;
    }

    // Write to a `stream`. It does not end the stream.
    saveToStream(stream: { write: (arg0: string) => void; }) {
        if (this.headerValue !== undefined) {
            stream.write(this.headerValue + '\n\n');
        }

        if (this.version !== undefined) {
            stream.write(`ninja_required_version = ${this.version}\n`);
        }

        if (this.buildDir !== undefined) {
            stream.write(`builddir=${this.buildDir}\n`);
        }

        for (const rule of this.rules) {
            rule.write(stream);
        }

        for (const edge of this.edges) {
            edge.write(stream);
        }

        for (const variable of this.variables) {
            variable.write(stream);
        }

        if (this.defaultRule != null) {
            return stream.write(`default ${this.defaultRule}\n`);
        }
    }

    // Save the Ninja file on the filesystem at this `path` and call
    // `callback` when it's done.
    save(path: string, callback?: () => void) {
        const file = fs.createWriteStream(path);
        this.saveToStream(file);
        if (callback) {
            file.on('close', () => callback());
        }
        return file.end();
    }
}

function factory(version?: string, builddir?: string) {
    return new NinjaBuilder(version, builddir);
}

factory.escape = escape

export default factory;
