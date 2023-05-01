import * as assert from 'assert';
import ninjaBuilder, { NinjaBuilder } from './ninja-build-gen.js';
import { readFileSync } from 'fs';
import * as path from 'path';

// https://techsparx.com/nodejs/esnext/dirname-es-modules.html
const __dirname = path.dirname(new URL(import.meta.url).pathname);

const compareToString = function(ninja: NinjaBuilder, targetStr: string) {
    let str = '';
    const buffer = {
        write(value: string) {
            return str += value;
        }
    };
    ninja.saveToStream(buffer);
    return assert.equal(str, targetStr);
};

describe('ninja', function() {
    let ninja: NinjaBuilder;
    beforeEach(function() {
        ninja = ninjaBuilder();
    });

    describe('escape', function() {
        it('should escape proper characters', function () {
            assert.equal(ninjaBuilder.escape('foo:bar$glo fiz.js'),
                'foo$:bar$$glo$ fiz.js');
        })
    });

    describe('#rule', function() {
        it('should specify the command line', function() {
            ninja.rule('coffee').run('coffee -cs < $in > $out');
            return compareToString(ninja,
                `\
rule coffee
  command = coffee -cs < $in > $out\n\
`
            );
        });

        it('should create a description', function() {
            ninja.rule('coffee')
                .description('Compile coffee file: $in');
            return compareToString(ninja,
                `\
rule coffee
  command = \n  description = Compile coffee file: $in\n\
`
            );
        });

        it('should create a depfile binding', function() {
            ninja.rule('coffee')
                .depfile('$out.d');
            return compareToString(ninja,
                `\
rule coffee
  command = \n  depfile = $out.d
  deps = gcc\n\
`
            );
        });

        it('should enable restat', function() {
            ninja.rule('coffee')
                .restat(true);
            return compareToString(ninja,
                `\
rule coffee
  command = \n  restat = 1\n\
`
            );
        });

        return it('should label as generator', function() {
            ninja.rule('coffee')
                .generator(true);
            return compareToString(ninja,
                `\
rule coffee
  command = \n  generator = 1\n\
`
            );
        });
    });

    describe('#edge', function() {
        it('should create a simple phony edge', function() {
            ninja.edge('simple_phony');
            return compareToString(ninja, 'build simple_phony: phony\n');
        });
        it('should create a multi-target phony edge', function() {
            ninja.edge(['phony1', 'phony2']);
            return compareToString(ninja, 'build phony1 phony2: phony\n');
        });
        it('should specify a rule', function() {
            ninja.edge('baobab.js').using('coffee');
            return compareToString(ninja, 'build baobab.js: coffee\n');
        });
        it('should bind a variable', function() {
            ninja.edge('baobab.js').assign('foobar', 42);
            return compareToString(ninja, 'build baobab.js: phony\n  foobar = 42\n');
        });

        describe('#from', function() {
            it('should specify a source', function() {
                ninja.edge('dist').from('debug');
                return compareToString(ninja, 'build dist: phony debug\n');
            });
            it('should specify several sources', function() {
                ninja.edge('dist').from(['debug', 'release']);
                return compareToString(ninja, 'build dist: phony debug release\n');
            });
            return it('should specify accumulated sources', function() {
                ninja.edge('dist').from('debug').from(['release', 'lint']);
                return compareToString(ninja, 'build dist: phony debug release lint\n');
            });
        });

        describe('#need', function() {
            it('should specify a requirement', function() {
                ninja.edge('dist').need('debug');
                return compareToString(ninja, 'build dist: phony | debug\n');
            });
            it('should specify several requirements', function() {
                ninja.edge('dist').need(['debug', 'release']);
                return compareToString(ninja, 'build dist: phony | debug release\n');
            });
            return it('should specify accumulated requirements', function() {
                ninja.edge('dist').need('debug').need(['release', 'lint']);
                return compareToString(ninja,
                    'build dist: phony | debug release lint\n');
            });
        });

        return describe('#after', function() {
            it('should specify a order-only requirement', function() {
                ninja.edge('dist').after('debug');
                return compareToString(ninja, 'build dist: phony || debug\n');
            });
            it('should specify several order-only requirements', function() {
                ninja.edge('dist').after(['debug', 'release']);
                return compareToString(ninja,
                    'build dist: phony || debug release\n');
            });
            return it('should specify accumulated order-only requirements', function() {
                ninja.edge('dist').after('debug').after(['release', 'lint']);
                return compareToString(ninja,
                    'build dist: phony || debug release lint\n');
            });
        });
    });

    describe('#header', () => it('should add a header', function() {
        ninja.header('foobar\nfizzbuzz');
        return compareToString(ninja, 'foobar\nfizzbuzz\n\n');
    }));

    describe('#assign', () => it('should bind a variable', function() {
        ninja.assign('some_var', 42);
        return compareToString(ninja, 'some_var = 42\n');
    }));

    return describe('#save', function() {
        it('should properly save to file', function(done) {
            ninja.assign('some_var', 42);
            const filePath = `${__dirname}/test.ninja`;
            return ninja.save(filePath, function() {
                const savedStr = readFileSync(filePath, 'utf-8');
                assert.equal(savedStr,
                    `\
some_var = 42\n\
`
                );
                done();
            });
        });
        return it('should save to file without callback', function() {
            ninja.assign('some_var', 42);
            const filePath = `${__dirname}/test.ninja`;
            return ninja.save(filePath);
        });
    });
});
