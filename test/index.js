'use strict';
const Assert = require('assert');
const Lab = require('@hapi/lab');
const { describe, it } = exports.lab = Lab.script();
const { transpile } = require('..');

describe('Transpilation', () => {
  const transpilationTests = [
    {
      name: 'variable declarations',
      source: `
        const singleConst = -1234;
        const listConst0 = 10, listConst1 = 10e7;
        let singleLet = 'abc';
        var singleVar = true;
      `,
      expected: `
        #set( $singleConst = -1234 )
        #set( $listConst0 = 10 )
        #set( $listConst1 = 100000000 )
        #set( $singleLet = 'abc' )
        #set( $singleVar = true )
      `
    },

    {
      name: 'binary operations',
      source: `
        const c0 = 3 + 1;
        const c1 = 1 + 2 * 3;
        const c2 = (1 + 2) * 3;
        const c3 = 1 + 2 * 3 + 4;
        const c4 = 1 + (2 * 3) + 4;
        const c5 = (1 + 2) * (3 + 4);
      `,
      expected: `
        #set( $c0 = 3 + 1 )
        #set( $c1 = 1 + 2 * 3 )
        #set( $c2 = (1 + 2) * 3 )
        #set( $c3 = 1 + 2 * 3 + 4 )
        #set( $c4 = 1 + 2 * 3 + 4 )
        #set( $c5 = (1 + 2) * (3 + 4) )
      `
    },

    {
      name: 'if...else if...else statement',
      source: `
        const foo = 3;

        if (foo === 1) {
          const bar = 'def';
        } else if (foo === 2) {
          const bar = 'ghi';
        } else {
          const bar = 'xyz';
        }
      `,
      expected: `
        #set( $foo = 3 )
        #if( $foo === 1 )
          #set( $bar = 'def' )
        #elseif( $foo === 2 )
          #set( $bar_1 = 'ghi' )
        #else
          #set( $bar_2 = 'xyz' )
        #end
      `
    },

    {
      name: 'for...of statement',
      source: `
        const array = [];

        for (const item of array) {
          const foo = 0xf;
        }
      `,
      expected: `
        #set( $array = [] )
        #foreach( $item in $array )
          #set( $foo = 15 )
        #end
      `
    },

    {
      name: 'property access',
      source: `
        const value0 = foo.bar;
        const value1 = foo.bar.baz;
        const value2 = foo.bar.baz.abc;
      `,
      expected: `
        #set( $value0 = $foo.bar )
        #set( $value1 = $foo.bar.baz )
        #set( $value2 = $foo.bar.baz.abc )
      `
    },

    {
      name: 'array expression',
      source: `
        const arr0 = [];
        const arr1 = [1, 'two', arr0, false, 1 + arr0];
      `,
      expected: `
        #set( $arr0 = [] )
        #set( $arr1 = [1, 'two', $arr0, false, 1 + $arr0] )
      `
    },

    {
      name: 'array expression hole',
      source: `
        const arr2 = [1, , 2];
      `,
      error: /Line 2, column 22: array holes are not supported/
    },

    {
      name: 'object expression',
      source: `
        const obj0 = {};
        const obj1 = { p0: 1, p1: 'two', p2: obj0, p3: false };
        const obj2 = { p0: 1 + obj0 };
      `,
      expected: `
        #set( $obj0 = {} )
        #set( $obj1 = {'p0': 1, 'p1': 'two', 'p2': $obj0, 'p3': false} )
        #set( $obj2 = {'p0': 1 + $obj0} )
      `
    },

    {
      name: 'object expression method',
      source: `
        const obj = { method() {} };
      `,
      error: /Line 2, column 23: methods \('method'\) are not supported/
    },

    {
      name: 'object expression getter',
      source: `
        const obj = { get property() {} };
      `,
      error: /Line 2, column 23: getters \('property'\) are not supported/
    },

    {
      name: 'object expression setter',
      source: `
        const obj = { set property(arg) {} };
      `,
      error: /Line 2, column 23: setters \('property'\) are not supported/
    },

    {
      name: 'object expression computed property',
      source: `
        const obj = { ['computed']: 5 };
      `,
      error: /Line 2, column 23: computed properties are not supported/
    },

    {
      name: 'method call',
      source: `
        const value0 = foo.bar();
        const value1 = foo.bar().baz;
        const value2 = foo.bar().baz().abc;
        const value3 = foo.bar(3, true, 'str', value0, 1 + value0);
      `,
      expected: `
        #set( $value0 = $foo.bar() )
        #set( $value1 = $foo.bar().baz )
        #set( $value2 = $foo.bar().baz().abc )
        #set( $value3 = $foo.bar(3, true, 'str', $value0, 1 + $value0) )
      `
    },

    {
      name: 'non-method function call',
      source: `
        foo();
      `,
      error: /Line 2, column 9: non-method functions are not supported: foo/
    },

    {
      name: 'switch statement',
      source: `
        let foo = 5;
        let value = 0;

        switch (foo) {
          case 1:
            value = 1;
            break;
          case 2:
            value = 2;
            break;
          case 3:
          case 4:
            value = 7;
          default:
            value = 99;
        }
      `,
      expected: `
        #set( $foo = 5 )
        #set( $value = 0 )
        #set( $matched = false )
        #set( $fallthrough = false )
        #set( $discriminant = foo )
        #if( $fallthrough || $discriminant == 1 )
          #set( $value = 1 )
          #set( $matched = true )
          #set( $fallthrough = false )
        #end
        #if( $fallthrough || $discriminant == 2 )
          #set( $value = 2 )
          #set( $matched = true )
          #set( $fallthrough = false )
        #end
        #if( $fallthrough || $discriminant == 3 )
          #set( $matched = true )
          #set( $fallthrough = true )
        #end
        #if( $fallthrough || $discriminant == 4 )
          #set( $value = 7 )
          #set( $matched = true )
          #set( $fallthrough = true )
        #end
        #if( $fallthrough || !$matched )
          #set( $value = 99 )
          #set( $matched = true )
          #set( $fallthrough = true )
        #end
      `
    },

    {
      name: 'try...catch statement',
      source: `
        try {

        } catch (err) {

        }
      `,
      error: /Line 2, column 9: 'try\.\.\.catch' statements are not supported/
    },

    {
      name: 'debugger statement',
      source: `
        debugger;
      `,
      error: /Line 2, column 9: 'debugger' statements are not supported/
    },

    {
      name: 'do...while loop',
      source: `
        do {

        } while (true)
      `,
      error: /Line 2, column 9: 'do\.\.\.while' loops are not supported/
    },

    {
      name: 'for...in loop',
      source: `
        for (const property in object) {

        }
      `,
      error: /Line 2, column 9: 'for\.\.\.in' loops are not supported/
    },

    {
      name: 'for loop',
      source: `
        for (let i = 0; i < foo.length; i++) {

        }
      `,
      error: /Line 2, column 9: 'for' loops are not supported/
    },

    {
      name: 'function declaration',
      source: `
        function foo() {}
      `,
      error: /Line 2, column 9: function declarations are not supported/
    },

    {
      name: 'function expression',
      source: `
        const foo = function foo() {};
      `,
      error: /Line 2, column 21: function expressions are not supported/
    },

    {
      name: 'this expression',
      source: `
        const foo = this.bar();
      `,
      error: /Line 2, column 21: 'this' expressions are not supported/
    },

    {
      name: 'throw statement',
      source: `
        throw new Error('oh no');
      `,
      error: /Line 2, column 9: 'throw' statements are not supported/
    },

    {
      name: 'while loop',
      source: `
        while (true) {

        }
      `,
      error: /Line 2, column 9: 'while' loops are not supported/
    },

    {
      name: 'with statement',
      source: `
        with (foo) {

        }
      `,
      error: /Line 2, column 9: 'with' statements are not supported/
    },

    {
      name: 'symbol data type',
      source: `
        const foo = Symbol();
      `,
      error: /Line 2, column 21: symbol data types are not supported/
    },

    {
      name: 'use of undeclared variable',
      source: `
        const foo = bar + baz;
      `,
      error: /Line 2, column 21: variable 'bar' was not declared/
    },

    {
      name: 'assignment to undeclared variable',
      source: `
        foo = 1;
      `,
      error: /Line 2, column 9: variable 'foo' was not declared/
    },

    {
      name: 'variable versions due to scope',
      source: `
        const a = 0;
        let c = 6;

        {
          const a = 1;
          let b = 2;

          b = a + b + 3 + c;
          c = 7;
        }

        const b = 4 + a + c;
      `,
      expected: `
        #set( $a = 0 )
        #set( $c = 6 )
        #set( $a_1 = 1 )
        #set( $b = 2 )
        #set( $b = $a_1 + $b + 3 + $c )
        #set( $c = 7 )
        #set( $b_1 = 4 + $a + $c )
      `
    },

    {
      name: 'injected global variables',
      env: { globals: ['global'] },
      source: `
        global = 0;
      `,
      expected: `
        #set( $global = 0 )
      `
    },

    {
      // TODO(cjihrig): Handle 'use strict' better, as well as the double $$.
      // TODO(cjihrig): $ctx and $util should need to be provided as globals.
      name: 'expression statement',
      source: `
        'use strict';
        $ctx.stash.put(
          "defaultValues",
          $util.defaultIfNull($ctx.stash.defaultValues, {})
        )
        const createdAt = $util.time.nowISO8601();
        $ctx.stash.defaultValues.put("id", $util.autoId());
        $ctx.stash.defaultValues.put("createdAt", createdAt);
        $util.qr($ctx.stash.defaultValues.put("updatedAt", createdAt))
        $util.toJson({
          "version": "2018-05-29",
          "payload": {}
        })
      `,
      expected: `
        #set( $discard = 'use strict' )
        #set( $discard = $$ctx.stash.put('defaultValues', $$util.defaultIfNull($$ctx.stash.defaultValues, {})) )
        #set( $createdAt = $$util.time.nowISO8601() )
        #set( $discard = $$ctx.stash.defaultValues.put('id', $$util.autoId()) )
        #set( $discard = $$ctx.stash.defaultValues.put('createdAt', $createdAt) )
        #set( $discard = $$util.qr($$ctx.stash.defaultValues.put('updatedAt', $createdAt)) )
        #set( $discard = $$util.toJson({'version': '2018-05-29', 'payload': {}}) )
      `
    }
  ];

  for (const test of transpilationTests) {
    it(test.name, () => {
      if (test.error) {
        Assert.throws(() => {
          transpile(test.source, test.env);
        }, test.error);
      } else {
        const actual = dedent(transpile(test.source, test.env));
        const expected = dedent(test.expected);

        Assert.strictEqual(actual, expected);
      }
    });
  }
});


function dedent(str) {
  const lines = str.split('\n');
  let minIndent = Infinity;

  if (lines[0].trim() === '') {
    lines.shift();
  }

  if (lines.length > 0 && lines[lines.length - 1].trim() === '') {
    lines.pop();
  }

  for (const line of lines) {
    const indent = line.length - line.trimLeft().length;

    minIndent = Math.min(minIndent, indent);
  }

  for (let i = 0; i < lines.length; i++) {
    lines[i] = lines[i].slice(minIndent);
  }

  return lines.join('\n').trimRight();
}
