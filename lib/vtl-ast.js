'use strict';
const { EOL } = require('os');
const operatorPrecedence = new Map([
  ['+', 1],
  ['-', 1],
  ['*', 2],
  ['/', 2]
]);

// TODO(cjihrig): Implement a symbol table for VTL.

class BinaryExpressionNode {
  constructor(operator, left, right) {
    this.operator = operator;
    this.left = left;
    this.right = right;
    this.precedence = operatorPrecedence.get(operator);
  }

  serialize(context) {
    return this.toString();
  }

  toString() {
    let lhs = this.left.toString();
    let rhs = this.right.toString();

    if (this.left.precedence && this.left.precedence < this.precedence) {
      lhs = `(${lhs})`;
    }

    if (this.right.precedence && this.right.precedence < this.precedence) {
      rhs = `(${rhs})`;
    }

    return `${lhs} ${this.operator} ${rhs}`;
  }
}


class BreakDirectiveNode {
  constructor(scope) {
    this.scope = scope;
  }

  serialize(context) {
    return `${context.indentation()}${this.toString()}${context.eol}`;
  }

  toString() {
    if (this.scope) {
      return `#break( ${this.scope} )`;
    } else {
      return '#break';
    }
  }
}


class ForEachDirectiveNode {
  constructor(iterator, iterable, body) {
    this.iterator = iterator;
    this.iterable = iterable;
    this.body = body;
  }

  serialize(context) {
    let str = `#foreach( ${this.iterator} in ${this.iterable} )${context.eol}`;

    context.indent();
    str += this.body.serialize(context);
    context.dedent();
    str += '#end';
    return str;
  }
}


class IdentifierNode {
  constructor(name) {
    // TODO(cjihrig): Validate that name is a valid VTL identifier.
    this.name = name;
  }

  serialize(context) {
    return this.toString();
  }

  toString() {
    return this.name;
  }
}


class IfDirectiveNode {
  constructor(test, consequent, alternate) {
    this.test = test;
    this.consequent = consequent;
    this.alternate = alternate;
    this.isElseIf = false;

    // Track #if vs. #elseif
    if (alternate instanceof IfDirectiveNode) {
      this.alternate.isElseIf = true;
    }
  }

  serialize(context) {
    const directive = this.isElseIf ? 'elseif' : 'if';
    let str = `#${directive}( ${this.test.serialize(context)} )${context.eol}`;

    context.indent();
    str += this.consequent.serialize(context);
    context.dedent();

    if (this.alternate) {
      if (this.alternate.isElseIf) {
        str += this.alternate.serialize(context);
        return str;
      }

      str += `#else${context.eol}`;
      context.indent();
      str += this.alternate.serialize(context);
      context.dedent();
    }

    str += `#end${context.eol}`;
    return str;
  }
}


class IncludeDirectiveNode {
  constructor(...files) {
    this.files = files;
  }

  serialize(context) {
    return `${context.indentation()}${this.toString()}${context.eol}`;
  }

  toString() {
    return `#include( ${this.files.join(', ')} )`;
  }
}


class LiteralNode {
  constructor(value) {
    this.value = value;
  }

  serialize(context) {
    return this.toString();
  }

  toString() {
    if (typeof this.value === 'string') {
      return `'${this.value}'`;
    }

    return String(this.value);
  }
}


class MethodReferenceNode {
  constructor(property, ...parameters) {
    this.property = property;
    this.parameters = parameters;
  }

  serialize(context) {
    return this.toString();
  }

  toString() {
    const args = this.parameters.join(', ');
    // TODO(cjihrig): Use VTL formal reference notation here?
    return `${this.property}(${args})`;
  }
}


class ParseDirectiveNode {
  constructor(file) {
    this.file = file;
  }

  serialize(context) {
    return `${context.indentation()}${this.toString()}${context.eol}`;
  }

  toString() {
    return `#parse( ${this.file} )`;
  }
}


class PropertyReferenceNode {
  constructor(receiver, property) {
    this.receiver = receiver;
    this.property = property;
    this.isReferenceRoot = true;

    if (receiver instanceof PropertyReferenceNode) {
      this.receiver.isReferenceRoot = false;
    } else if (receiver instanceof MethodReferenceNode) {
      this.receiver.property.isReferenceRoot = false;
    }
  }

  serialize(context) {
    return this.toString();
  }

  toString() {
    const prefix = this.isReferenceRoot ? '$' : '';
    // TODO(cjihrig): Use VTL formal reference notation here?
    return `${prefix}${this.receiver}.${this.property}`;
  }
}


class SetDirectiveNode {
  constructor(reference, expression) {
    this.reference = reference;
    this.expression = expression;
  }

  serialize(context) {
    return `${context.indentation()}${this.toString()}${context.eol}`;
  }

  toString() {
    return `#set( ${this.reference} = ${this.expression} )`;
  }
}


class StatementListNode {
  constructor(statements) {
    this.statements = statements;
  }

  serialize(context) {
    let str = '';

    for (const statement of this.statements) {
      str += statement.serialize(context);
    }

    return str;
  }
}


class StopDirectiveNode {
  constructor(message) {
    this.message = message;
  }

  serialize(context) {
    return `${context.indentation()}${this.toString()}${context.eol}`;
  }

  toString() {
    if (this.message) {
      return `#stop( ${this.message} )`;
    } else {
      return '#stop';
    }
  }
}


class UnaryExpressionNode {
  constructor(operator, argument, prefix = true) {
    this.operator = operator;
    this.argument = argument;
    this.prefix = prefix;
  }

  serialize(context) {
    return this.toString();
  }

  toString() {
    // TODO(cjihrig): Are there any postfix unary expressions?
    // TODO(cjihrig): Make operator strings like '!' into constants.
    const separator = this.operator === '!' || this.operator === '-' ? '' : ' ';

    return `${this.operator}${separator}${this.argument}`;
  }
}


class VariableReferenceNode {
  constructor(identifier) {
    this.identifier = identifier;
  }

  serialize(context) {
    return this.toString();
  }

  toString() {
    // TODO(cjihrig): Use VTL formal reference notation here?
    return `$${this.identifier}`;
  }
}


class SerializationContext {
  constructor() {
    this.eol = EOL;
    this.indentString = '  '; // Two spaces.
    this.indentLevel = 0;
  }

  indentation() {
    return this.indentString.repeat(this.indentLevel);
  }

  indent(increaseBy = 1) {
    this.indentLevel += increaseBy;
  }

  dedent(decreaseBy = 1) {
    this.indentLevel -= decreaseBy;
  }
}


// TODO(cjihrig): Need more node types.
// See https://velocity.apache.org/engine/1.4/specification-bnf.html
module.exports = {
  BinaryExpressionNode,
  BreakDirectiveNode,
  ForEachDirectiveNode,
  IdentifierNode,
  IfDirectiveNode,
  IncludeDirectiveNode,
  LiteralNode,
  MethodReferenceNode,
  ParseDirectiveNode,
  PropertyReferenceNode,
  SerializationContext,
  SetDirectiveNode,
  StatementListNode,
  StopDirectiveNode,
  UnaryExpressionNode,
  VariableReferenceNode
};
