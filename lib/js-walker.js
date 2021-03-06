'use strict';
// TODO(cjihrig): Need to handle strict mode directive.
// TODO(cjihrig): Need to handle const differently.
// TODO(cjihrig): Should var be disallowed due to hoisting.
const Acorn = require('acorn');
const AcornWalk = require('acorn-walk');
/* eslint-disable no-unused-vars */
const { SymbolTable } = require('./symbol-table');
const {
  ArrayListNode,
  BinaryExpressionNode,
  BreakDirectiveNode,
  ForEachDirectiveNode,
  IdentifierNode,
  IfDirectiveNode,
  IncludeDirectiveNode,
  LiteralNode,
  MapNode,
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
const parserOptions = { ecmaVersion: 2021, locations: true };
const kDiscardName = 'discard';

const walkers = {
  ArrayExpression(node, state, visit) {
    const array = [];

    for (const element of node.elements) {
      if (element === null) {
        reportError('array holes are not supported', node.loc);
      }

      visit(element, state, element.type);
      const value = nonDeclVarRef(state.lastChild, state, element);
      array.push(value);
    }

    state.lastChild = new ArrayListNode(array);
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
    const left = nonDeclVarRef(state.lastChild, state, node.left);
    visit(node.right, state, node.right.type);
    const right = nonDeclVarRef(state.lastChild, state, node.right);
    // TODO(cjihrig): Need to map (or reject) JS operators to VTL.
    state.lastChild = new BinaryExpressionNode(node.operator, left, right);
  },

  BlockStatement(node, state, visit) {
    const statements = [];

    enterScope(state);

    // TODO(cjihrig): Can this just be map()
    for (const stmt of node.body) {
      visit(stmt, state, stmt.type);
      statements.push(state.lastChild);
    }

    exitScope(state);
    state.lastChild = new StatementListNode(statements);
  },

  BreakStatement: unsupported('\'break\' statements are not supported'),

  CallExpression(node, state, visit) {
    visit(node.callee, state, node.callee.type);

    if (node.callee.type !== 'MemberExpression') {
      const name = node.callee?.name ?? null;

      if (name === 'Symbol') {
        reportError('symbol data types are not supported', node.loc);
      }

      reportError(`non-method functions are not supported: ${name}`, node.loc);
    }

    const propertyRef = state.lastChild;
    const args = node.arguments.map((a) => {
      visit(a, state, a.type);
      return nonDeclVarRef(state.lastChild, state, a);
    });

    state.lastChild = new MethodReferenceNode(propertyRef, args);
  },

  CatchClause: unsupported('\'try...catch\' statements are not supported'),
  ContinueStatement: unsupported('\'continue\' statements are not supported'),
  DebuggerStatement: unsupported('\'debugger\' statements are not supported'),
  DoWhileStatement: unsupported('\'do...while\' loops are not supported'),

  ExpressionStatement(node, state, visit) {
    visit(node.expression, state, node.expression.type);
    const expr = state.lastChild;

    if (node.expression.type === 'AssignmentExpression') {
      // TODO(cjihrig): Assert that expr.left is an IdentifierNode.
      const reference = nonDeclVarRef(expr.left, state, node.expression);
      state.lastChild = new SetDirectiveNode(reference, expr.right);
    } else {
      const reference = nonDeclVarRef(
        new IdentifierNode(kDiscardName),
        state,
        node.expression
      );
      state.lastChild = new SetDirectiveNode(reference, expr);
    }
  },

  ForInStatement: unsupported('\'for...in\' loops are not supported'),

  ForOfStatement(node, state, visit) {
    visit(node.left, state, node.left.type);
    // TODO(cjihrig): iterator is a statement list. Assert the length is one?
    const iterator = state.lastChild.statements[0];
    const iteratorRef = nonDeclVarRef(iterator, state, node.left);
    visit(node.right, state, node.right.type);
    const iterable = state.lastChild;
    const iterableRef = nonDeclVarRef(iterable, state, node.right);
    visit(node.body, state, node.body.type);
    const body = state.lastChild;
    state.lastChild = new ForEachDirectiveNode(iteratorRef, iterableRef, body);
  },

  ForStatement: unsupported('\'for\' loops are not supported'),
  FunctionDeclaration: unsupported('function declarations are not supported'),
  FunctionExpression: unsupported('function expressions are not supported'),

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

  LabeledStatement: unsupported('labeled statements are not supported'),

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

  ObjectExpression(node, state, visit) {
    const map = new Map();

    for (const property of node.properties) {
      if (property.computed) {
        // TODO(cjihrig): Computed properties should be possible.
        reportError('computed properties are not supported', property.loc);
      }

      visit(property.key, state, property.key.type);
      const key = state.lastChild;
      const { name } = key;

      if (property.method) {
        reportError(`methods ('${name}') are not supported`, property.loc);
      }

      if (property.kind === 'get') {
        reportError(`getters ('${name}') are not supported`, property.loc);
      }

      if (property.kind === 'set') {
        reportError(`setters ('${name}') are not supported`, property.loc);
      }

      visit(property.value, state, property.value.type);
      const value = nonDeclVarRef(state.lastChild, state, property.value);
      map.set(key, value);
    }

    state.lastChild = new MapNode(map);
  },

  Program(node, state, visit) {
    const statements = [];

    enterScope(state);
    registerEnvGlobals(state);

    // TODO(cjihrig): Can this just be map()
    for (const stmt of node.body) {
      visit(stmt, state, 'Statement');
      statements.push(state.lastChild);
    }

    exitScope(state);
    // TODO(cjihrig): Is it fine to use a statement list as the root?
    state.lastChild = new StatementListNode(statements);
  },

  Property(node, state, visit) {
    // Not currently implemented. All visiting is done via ObjectExpression.
  },

  ReturnStatement: unsupported('\'return\' statements are not supported'),

  Statement(node, state, visit) {
    visit(node, state, node.type);
  },

  SwitchCase(node, state, visit) {
    // Not currently implemented. All visiting is done via SwitchStatement.
  },

  SwitchStatement(node, state, visit) {
    // VTL does not have a switch statement, but it can be implemented as a
    // collection of #if directives with the following properties:
    // - A temp variable stores the result of the discriminant so that it
    //   cannot be modified by user JS code.
    // - A temp variable stores if the JS case can fall through. This is set in
    //   each #if directive.
    // - A temp variable stores if the discriminant has been matched by a case.
    //   This prevents the default case from executing unnecessarily.
    // - Each JS case is a separate #if. The case is executed if the
    //   fallthrough flag is set or the discriminant matches the case's test.
    const statements = [];

    visit(node.discriminant, state, node.discriminant.type);

    // TODO(cjihrig): Need to generate unique temporary variables.
    const matched = declVarRef(new IdentifierNode('matched'), state);
    const fallthrough = declVarRef(new IdentifierNode('fallthrough'), state);
    const discriminant = declVarRef(new IdentifierNode('discriminant'), state);

    statements.push(new SetDirectiveNode(matched, new LiteralNode(false)));
    statements.push(new SetDirectiveNode(fallthrough, new LiteralNode(false)));
    // TODO(cjihrig): Implement proper expression handling here.
    statements.push(new SetDirectiveNode(discriminant, state.lastChild));

    for (const switchCase of node.cases) {
      const consequentStmts = [];
      let canFallthrough = true;
      let isDefault;
      let caseTest;

      if (switchCase.test === null) {
        caseTest = null;
        isDefault = true;
      } else {
        visit(switchCase.test, state, switchCase.test.type);
        caseTest = new BinaryExpressionNode(
          '==',
          discriminant,
          state.lastChild
        );
        isDefault = false;
      }

      for (const stmt of switchCase.consequent) {
        if (stmt.type === 'BreakStatement') {
          canFallthrough = false;
          break;
        }

        visit(stmt, state, stmt.type);
        consequentStmts.push(state.lastChild);
      }

      consequentStmts.push(
        new SetDirectiveNode(matched, new LiteralNode(true))
      );
      consequentStmts.push(
        new SetDirectiveNode(fallthrough, new LiteralNode(canFallthrough))
      );

      const consequent = new StatementListNode(consequentStmts);

      if (isDefault) {
        const test = new BinaryExpressionNode(
          '||',
          fallthrough,
          new UnaryExpressionNode('!', matched, true)
        );

        statements.push(new IfDirectiveNode(test, consequent, null));
      } else {
        const test = new BinaryExpressionNode('||', fallthrough, caseTest);

        statements.push(new IfDirectiveNode(test, consequent, null));
      }
    }

    state.lastChild = new StatementListNode(statements);
  },

  ThisExpression: unsupported('\'this\' expressions are not supported'),
  ThrowStatement: unsupported('\'throw\' statements are not supported'),
  TryStatement: unsupported('\'try...catch\' statements are not supported'),

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
    const reference = declVarRef(identifier, state);

    // TODO(cjihrig): Should node.init === null even be supported in VTL?
    if (node.init !== null) {
      visit(node.init, state, node.init.type);
      const expression = state.lastChild;
      state.lastChild = new SetDirectiveNode(reference, expression);
    }
  },

  WhileStatement: unsupported('\'while\' loops are not supported'),
  WithStatement: unsupported('\'with\' statements are not supported')
};


function declVarRef(node, state) {
  // Convenience function to create an Identifier in a VariableReference when
  // declaring a new variable.
  if (!(node instanceof IdentifierNode)) {
    return node;
  }

  const symbol = state.scope.symbol(node.name);

  return new VariableReferenceNode(node, symbol);
}


function nonDeclVarRef(node, state, jsNode) {
  // Convenience function to create an Identifier in a VariableReference when
  // referencing a variable that is not being declared.
  if (!(node instanceof IdentifierNode)) {
    return node;
  }

  const symbol = state.scope.lookup(node.name);

  if (symbol === undefined) {
    reportError(`variable '${node.name}' was not declared`, jsNode.loc);
  }

  return new VariableReferenceNode(node, symbol);
}


function registerEnvGlobals(state) {
  const globals = state?.env?.globals ?? [];

  for (const globalVariable of globals) {
    state.scope.symbol(globalVariable);
  }

  state.scope.symbol(kDiscardName);
}


function unsupported(message) {
  return (node) => {
    reportError(message, node.loc);
  };
}


function reportError(message, loc) {
  let msg = '';

  if (loc?.start) {
    msg += `Line ${loc.start.line}, column ${loc.start.column + 1}: `;
  }

  msg += message;
  const err = new Error(msg);
  err.stack = undefined;
  throw err;
}


function enterScope(state) {
  if (state.scope === null) {
    state.scope = new SymbolTable();
  } else {
    state.scope = state.scope.createNestedScope();
  }
}


function exitScope(state) {
  if (state.scope !== null) {
    state.scope = state.scope.parent;
  }
}


function transpile(source, env) {
  const ast = Acorn.parse(source, parserOptions);
  const state = { lastChild: null, scope: null, env };
  const serializationContext = new SerializationContext();

  AcornWalk.recursive(ast, state, walkers);

  return state.lastChild.serialize(serializationContext);
}

module.exports = { transpile };
