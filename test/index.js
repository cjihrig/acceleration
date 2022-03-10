'use strict';
const Assert = require('assert');
const { EOL } = require('os');
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
        if (foo === 1) {
          const bar = 'def';
        } else if (foo === 2) {
          const bar = 'ghi';
        } else {
          const bar = 'xyz';
        }
      `,
      expected: `
        #if( foo === 1 )
          #set( $bar = 'def' )
        #elseif( foo === 2 )
          #set( $bar = 'ghi' )
        #else
          #set( $bar = 'xyz' )
        #end
      `
    },

    {
      name: 'for...of statement',
      source: `
        for (const item of array) {
          const foo = 0xf;
        }
      `,
      expected: `
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
      name: 'method call',
      source: `
        const value0 = foo.bar();
        const value1 = foo.bar().baz;
        const value2 = foo.bar().baz().abc;
      `,
      expected: `
        #set( $value0 = $foo.bar() )
        #set( $value1 = $foo.bar().baz )
        #set( $value2 = $foo.bar().baz().abc )
      `
    },

    {
      name: 'switch statement',
      source: `
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
      name: 'symbol data types',
      source: `
        const foo = Symbol();
      `,
      error: /Line 2, column 21: symbol data types are not supported/
    }
  ];

  for (const test of transpilationTests) {
    it(test.name, () => {
      if (test.error) {
        Assert.throws(() => {
          transpile(test.source);
        }, test.error);
      } else {
        const actual = dedent(transpile(test.source));
        const expected = dedent(test.expected);

        Assert.strictEqual(actual, expected);
      }
    });
  }
});


function dedent(str) {
  const lines = str.split(EOL);
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

  return lines.join(EOL).trimRight();
}
