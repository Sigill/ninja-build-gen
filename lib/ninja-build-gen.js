// # Ninja-build Generator
//
// This library exports a set of functions to build a Ninja file
// programmatically.
import * as fs from 'fs';
// Escape a string, like a path, to be suitable for Ninja.
// This is to be called explicitely because the user may want to use
// variables like `$foo` in paths, rules, etc.
export function escape(s) {
    return s.replace(/[ :$]/g, (match) => '$' + match);
}
// Represent a Ninja variable assignation (it's more a binding, actually).
class NinjaAssignBuilder {
    constructor(name, value) {
        this.name = name;
        this.value = value;
    }
    // Write the assignation into a `stream`.
    write(stream) {
        return stream.write(`${this.name} = ${this.value}\n`);
    }
}
// Represent a Ninja edge, that is, "how to construct this file X from Y".
class NinjaEdgeBuilder {
    // Construct an edge specifing the resulting files, as `targets`, of the
    // edge.
    constructor(targets) {
        this.assigns = {};
        this.rule = 'phony';
        if (typeof targets === 'string') {
            this.targets = [targets];
        }
        else {
            this.targets = targets;
        }
    }
    // Define the Ninja `rule` name to use to build this edge.
    using(rule) {
        this.rule = rule;
        return this;
    }
    // Define one or several direct `sources`, that is, files to be transformed
    // by the rule.
    from(sources) {
        this.sources ??= [];
        if (typeof sources === 'string') {
            this.sources.push(sources);
        }
        else {
            this.sources.push(...sources);
        }
        return this;
    }
    // Define one or several indirect `dependencies`, that is, files needed but
    // not part of the compilation or transformation.
    need(dependencies) {
        this.dependencies ??= [];
        if (typeof dependencies === 'string') {
            this.dependencies.push(dependencies);
        }
        else {
            this.dependencies.push(...dependencies);
        }
        return this;
    }
    // Define one or several order-only dependencies in `orderDeps`, that is,
    // this edge should be build after those dependencies are.
    after(orderDeps) {
        this.orderDeps ??= [];
        if (typeof orderDeps === 'string') {
            this.orderDeps.push(orderDeps);
        }
        else {
            this.orderDeps.push(...orderDeps);
        }
        return this;
    }
    // Bind a variable to a temporary value for the edge.
    assign(name, value) {
        this.assigns[name] = value;
        return this;
    }
    // Assign this edge to a pool.
    // See https://ninja-build.org/manual.html#ref_pool
    pool(pool) {
        this._pool = pool;
        return this;
    }
    // Write the edge into a `stream`.
    write(stream) {
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
    // Create a rule with this `name`.
    constructor(name) {
        this.name = name;
        this.command = '';
    }
    // Specify the command-line to run to execute the rule.
    run(command) {
        this.command = command;
        return this;
    }
    // Provide a description, displayed by Ninja instead of the bare command-
    // line.
    description(desc) {
        this.desc = desc;
        return this;
    }
    // Provide a Makefile-compatible dependency file for the rule products.
    depfile(file) {
        this.dependencyFile = file;
        return this;
    }
    restat(doRestat) {
        this.doRestat = doRestat;
        return this;
    }
    generator(isGenerator) {
        this.isGenerator = isGenerator;
        return this;
    }
    pool(pool) {
        this._pool = pool;
        return this;
    }
    // Write the rule into a `stream`.
    write(stream) {
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
    // Create the builder, specifing an optional required Ninja `version`, and a
    // build directory (where Ninja put logs and where you can put
    // intermediary products).
    constructor(version, buildDir) {
        this.edges = [];
        this.rules = [];
        this.variables = [];
        this._edgeCount = 0;
        this._ruleCount = 0;
        this.version = version;
        this.buildDir = buildDir;
    }
    get edgeCount() { return this._edgeCount; }
    get ruleCount() { return this._ruleCount; }
    // Set an arbitrary header.
    header(value) {
        this.headerValue = value;
        return this;
    }
    // Specify the default rule by its `name`.
    byDefault(name) {
        this.defaultRule = name;
        return this;
    }
    // Add a variable assignation into `name` from the `value`.
    assign(name, value) {
        const clause = new NinjaAssignBuilder(name, value);
        this.variables.push(clause);
        return clause;
    }
    // Add a rule and return it.
    rule(name) {
        const clause = new NinjaRuleBuilder(name);
        this.rules.push(clause);
        this._ruleCount++;
        return clause;
    }
    // Add an edge and return it.
    edge(targets) {
        const clause = new NinjaEdgeBuilder(targets);
        this.edges.push(clause);
        this._edgeCount++;
        return clause;
    }
    // Write to a `stream`. It does not end the stream.
    saveToStream(stream) {
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
    save(path, callback) {
        const file = fs.createWriteStream(path);
        this.saveToStream(file);
        if (callback) {
            file.on('close', () => callback());
        }
        return file.end();
    }
}
function factory(version, builddir) {
    return new NinjaBuilder(version, builddir);
}
factory.escape = escape;
export default factory;
//# sourceMappingURL=ninja-build-gen.js.map