export default ({ types: t }) => {
  const unreturnableStatements = new Set(["DebuggerStatement", "WithStatement", "ReturnStatement", "LabeledStatement",
    "BreakStatement", "ContinueStatement", "ThrowStatement"])
  const returnableStatements = new Set(["IfStatement", "SwitchStatement", "TryStatement", "WhileStatement",
    "DoWhileStatement", "ForStatement", "ForInStatement", "ForOfStatement"])

  const last = (array) => array[array.length - 1]

  const lastNotEmptyIndex = (nodes) => {
    for (let index = nodes.length - 1; index >= 0; index -= 1) {
      if (!t.isEmptyStatement(nodes[index])) return index
    }
  }

  // like babel-types#toExpression, but preserves function expressions
  const toExpression = (node) => {
    if (t.isExpressionStatement(node)) node = node.expression

    if (t.isClass(node)) {
      node.type = "ClassExpression"
    } else if (t.isFunctionDeclaration(node)) {
      node.type = "FunctionExpression"
    }

    if (t.isExpression(node)) return node
    throw new Error(`cannot turn ${node.type} to an expression`)
  }

  return {
    visitor: {
      Function(path) {
        const { node } = path

        if (node._noImplicitReturn) return

        // arrow function expression
        if (node.expression) return

        const { body, directives } = node.body

        if (body.length == 0) {
          // empty function
          if (directives.length == 0) return

          // function with directives only
          const directive = directives.pop()
          body.push(t.returnStatement(t.stringLiteral(directive.value.value)))

          return
        }

        const lastIndex = lastNotEmptyIndex(body)
        const lastNode = body[lastIndex]

        // skip unreturnable statements
        if (unreturnableStatements.has(lastNode.type)) return

        // convert returnable statements
        if (returnableStatements.has(lastNode.type)) {
          const returnablePath = path.get(`body.body.${lastIndex}`)
          const returnNode = t.returnStatement(t.thisExpression())
          const returnPath = returnablePath.insertAfter(returnNode)[0]

          returnablePath.remove()
          returnPath.get("argument").replaceWith(lastNode)

          if (t.isCallExpression(returnNode.argument)) {
            returnNode.argument.callee._noImplicitReturn = true
          }

          return
        }

        // variables declaration
        if (t.isVariableDeclaration(lastNode)) {
          let { id } = last(lastNode.declarations)

          if (t.isArrayPattern(id)) {
            id = last(id.elements).argument
          }

          if (t.isObjectPattern(id)) {
            id = last(id.properties).argument
          }

          body.push(t.returnStatement(id))

          return
        }

        body[lastIndex] = t.returnStatement(toExpression(lastNode))
      }
    }
  }
}
