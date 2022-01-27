'use strict';
// TODO(cjihrig): Need to handle strict mode directive.
// TODO(cjihrig): Need to handle const differently.
// TODO(cjihrig): Should var be disallowed due to hoisting.
// TODO(cjihrig): Need data types (possibly use TypeScript as source language).
const Acorn = require('acorn');
const AcornWalk = require('acorn-walk');
/* eslint-disable no-unused-vars */
const {
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
} = require('./vtl-ast');
/* eslint-enable no-unused-vars */
const parserOptions = { ecmaVersion: 2020 };
const walkers = {
  ArrayExpression(node, state, visit) {
    // TODO(cjihrig): Don't support holes in the JavaScript array.
    // TODO(cjihrig): Need VTL array AST node type.
  },

  AssignmentExpression(node, state, visit) {
    visit(node.left, state, node.left.type);
    const left = state.lastChild;
    visit(node.right, state, node.right.type);
    const right = state.lastChild;

    // TODO(cjihrig): Handle destructuring.
    // The LHS of the assignment must be a variable reference or
    // a property reference.
    state.lastChild = new BinaryExpressionNode(node.operator, left, right);
  },

  BinaryExpression(node, state, visit) {
    visit(node.left, state, node.left.type);
    const left = state.lastChild;
    visit(node.right, state, node.right.type);
    const right = state.lastChild;
    // TODO(cjihrig): Need to map (or reject) JS operators to VTL.
    state.lastChild = new BinaryExpressionNode(node.operator, left, right);
  },

  BlockStatement(node, state, visit) {
    const statements = [];

    // TODO(cjihrig): Can this just be map()
    for (const stmt of node.body) {
      visit(stmt, state, stmt.type);
      statements.push(state.lastChild);
    }

    state.lastChild = new StatementListNode(statements);
  },

  BreakStatement: unsupported,

  CallExpression(node, state, visit) {
    visit(node.callee, state, node.callee.type);

    if (node.callee.type !== 'MemberExpression') {
      // TODO(cjihrig): Does VTL have non-method functions?
      throw new Error('non-method functions are not supported');
    }

    // TODO(cjihrig): Process method arguments.
    const propertyRef = state.lastChild;
    state.lastChild = new MethodReferenceNode(propertyRef, []);
  },

  CatchClause: unsupported,
  ContinueStatement: unsupported,
  DebuggerStatement: unsupported,
  DoWhileStatement: unsupported,

  ExpressionStatement(node, state, visit) {
    visit(node.expression, state, node.expression.type);

    if (node.expression.type === 'AssignmentExpression') {
      const assignment = state.lastChild;
      // TODO(cjihrig): Assert that assignment.left is an IdentifierNode.
      const reference = new VariableReferenceNode(assignment.left);
      state.lastChild = new SetDirectiveNode(reference, assignment.right);
    }
  },

  ForInStatement: unsupported,

  ForOfStatement(node, state, visit) {
    visit(node.left, state, node.left.type);
    // TODO(cjihrig): iterator is a statement list. Assert the length is one?
    const iterator = state.lastChild.statements[0];
    const iteratorRef = new VariableReferenceNode(iterator);
    visit(node.right, state, node.right.type);
    const iterable = state.lastChild;
    const iterableRef = new VariableReferenceNode(iterable);
    visit(node.body, state, node.body.type);
    const body = state.lastChild;
    state.lastChild = new ForEachDirectiveNode(iteratorRef, iterableRef, body);
  },

  ForStatement: unsupported,
  FunctionDeclaration: unsupported,
  FunctionExpression: unsupported,

  Identifier(node, state, visit) {
    state.lastChild = new IdentifierNode(node.name);
  },

  IfStatement(node, state, visit) {
    visit(node.test, state, node.test.type);
    const test = state.lastChild;
    visit(node.consequent, state, node.consequent.type);
    const consequent = state.lastChild;
    visit(node.alternate, state, node.alternate.type);
    const alternate = state.lastChild;
    state.lastChild = new IfDirectiveNode(test, consequent, alternate);
  },

  LabeledStatement: unsupported,

  Literal(node, state, visit) {
    state.lastChild = new LiteralNode(node.value);
  },

  MemberExpression(node, state, visit) {
    visit(node.object, state, node.object.type);
    const receiver = state.lastChild;
    visit(node.property, state, node.property.type);
    const property = state.lastChild;
    state.lastChild = new PropertyReferenceNode(receiver, property);
  },

  ObjectExpression: unsupported,

  Program(node, state, visit) {
    const statements = [];

    // TODO(cjihrig): Can this just be map()
    for (const stmt of node.body) {
      visit(stmt, state, 'Statement');
      statements.push(state.lastChild);
    }

    // TODO(cjihrig): Is it fine to use a statement list as the root?
    state.lastChild = new StatementListNode(statements);
  },

  ReturnStatement: unsupported,

  Statement(node, state, visit) {
    visit(node, state, node.type);
  },

  ThisExpression: unsupported,
  ThrowStatement: unsupported,
  TryStatement: unsupported,

  UnaryExpression(node, state, visit) {
    const { argument, operator, prefix } = node;
    visit(argument, state, argument.type);
    const arg = state.lastChild;

    state.lastChild = new UnaryExpressionNode(operator, arg, prefix);
  },

  VariableDeclaration(node, state, visit) {
    const statements = [];

    // TODO(cjihrig): node.kind here specifies if the variables are var, let,
    // or const. Update the VTL symbol table with that information so we can
    // do things like error if a const variable is re-assigned.
    for (const declaration of node.declarations) {
      visit(declaration, state, declaration.type);
      statements.push(state.lastChild);
    }

    state.lastChild = new StatementListNode(statements);
  },

  VariableDeclarator(node, state, visit) {
    visit(node.id, state, node.id.type);
    const identifier = state.lastChild;
    const reference = new VariableReferenceNode(identifier);

    // TODO(cjihrig): Should node.init === null even be supported?
    if (node.init !== null) {
      visit(node.init, state, node.init.type);
      const expression = state.lastChild;
      state.lastChild = new SetDirectiveNode(reference, expression);
    }
  },

  WhileStatement: unsupported,
  WithStatement: unsupported
};


function unsupported(node) {
  throw new Error(`Node type '${node.type}' is not supported.`);
}


function transpile(source) {
  const ast = Acorn.parse(source, parserOptions);
  const state = { lastChild: null };
  const serializationContext = new SerializationContext();

  AcornWalk.recursive(ast, state, walkers);

  return state.lastChild.serialize(serializationContext);
}

module.exports = { transpile };
