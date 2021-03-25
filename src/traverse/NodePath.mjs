/* eslint-disable no-param-reassign, no-shadow */

import { traverse, traverseNodesFast, traversePathsFast } from './traverse.mjs';
import logger from '../utils/logger.mjs';
import { pathCache } from './cache.mjs';
import { Scope } from './Scope.mjs';

/**
A NodePath is required as a way of 'connecting' a node to its parent (and its parent, and so on...). We can't assign a `.parent` to a `node` (to create `node.parent`), because we'd end up with a cyclic reference; the parent already contains the node, so the node can't then contain the parent!
The solution: wrap both the node and the parent in a class.
*/
export default class NodePath {
  /**
  @param {Object} node - the node of a tree
  @param {Object} parent - the parent of the node (itself a node)
  @param {Object || Array} container - contains the node - see details immediately below.
  @param {string || number} key - where container[key] = node, always.
  @param {string} listKey - OPTIONAL - only required if `container` is an array.
  @param {NodePath} parentPath - OPTIONAL - since a parentPath won't exist for the top-most node of the tree.
  */
  /**
   * `container` naming conventions explained:
   * (note: these naming conventions DIFFER from those of babel)
   *     1) If the node is _not_ contained within a 'list' (an array):
   *        parent: {
   *            key: { <-- container = node
   *                // contents of the node
   *            }
   *        }
   *        // the node is at parent[key] = container
   *
   *     2) If the node _is_ contained within a list:
   *        parent: {
   *            key: [  <-- container
   *                { <-- index of array             <--| this is the node
   *                    // contents of the node      <--| at some 'key' (index)
   *                }                                <--| of this container
   *            ]
   *        }
   *        // the node is at parent[key][index] = container[index]
   *        // Notice how in both cases parent[key] = container.
   */
  constructor({ node, parent, key, container, index, parentPath }) {
    if (pathCache.has(node)) return pathCache.get(node);

    NodePath.validateConstructorArgs({ node, parent, container, key, index, parentPath });

    this.node = node;
    this.parent = parent;
    this.key = key;
    this.container = container;
    this.parentPath = parentPath || null;

    this.inList = Array.isArray(container);
    this.index = this.inList ? index : null;

    this.containerName = this.key; // synonym
    this.nodeType = this.node.nodeType;

    this.setScope();

    pathCache.set(node, this);
  }

  static validateConstructorArgs({ node, parent, key, container, index, parentPath }) {
    if (!parent) throw new Error(`Can't create a path without a parent`);
    if (!node) throw new Error(`Can't create a path without a node`);
    if (!container) throw new Error(`Can't create a path without a container`);
    if (!key && key !== 0) throw new Error(`Can't create a path without a key`);
    if (parent[key] !== container) throw new Error(`container !== parent[key]`);
    if (Array.isArray(container)) {
      if (!index && index !== 0) throw new Error(`index must exist for a container of type array`);
      if (container[index] !== node)
        throw new Error(`parent[key][index] !== node for a container of type 'array'`);
    } else {
      if (index || index === 0) {
        logger.warn(`index shouldn't exist for a non-array container`);
      }
      if (node !== container) throw new Error(`container !== node for a non-array container`);
    }
  }

  traverse(visitor, state) {
    traverse(this, visitor, state);
  }

  traversePathsFast(enter, state) {
    traversePathsFast(this, enter, state);
  }

  traverseNodesFast(enter, state) {
    traverseNodesFast(this.node, enter, state);
  }

  static getPath(node) {
    if (pathCache.has(node)) return pathCache.get(node);
    throw new Error('Node not found in pathCache');
  }

  /**
   @returns {string} - a human-readable path
   */
  getLocation() {
    const parts = [];
    let path = this;
    do {
      const part = path.inList ? `${path.key}[${path.index}]` : path.key;
      parts.unshift(part);
    } while ((path = path.parentPath));
    return parts.join('.');
  }

  // ANCESTRY:

  /**
   * Starting at current `path` and going up the tree, return the first
   * `path` that causes the provided `callback` to return a truthy value,
   * or `null` if the `callback` never returns a truthy value.
   * @return {NodePath || null}
   */
  findAncestor(callback) {
    let path = this;
    do {
      if (callback(path)) return path;
    } while ((path = path.parentPath));
    return null;
  }

  /**
   * Same as findAncestor, but starting at this path's parent.
   * @return {NodePath || null}
   */
  findAncestorFromParent(callback) {
    let path = this;
    while ((path = path.parentPath)) {
      if (callback(path)) return path;
    }
    return null;
  }

  /**
   * Starting at current `path` and going up the tree, execute a callback at
   * each ancestor node.
   * The callback must return something falsey if it can't find what it's
   * looking for. Otherwise, (if it finds what it's looking for) it can return
   * whatever it wants.
   * @returns { ? || falsey} - depends on the callback
   */
  queryAncestors(callback) {
    const path = this || null;
    if (!path) return null; // No more paths to look at. So not found anywhere.
    return callback(path) || (path.parentPath?.queryAncestors(callback) ?? null);
  }

  /**
   * Build an array of node paths containing the entire ancestry of the current node path.
   *
   * NOTE: The current node path is included in this.
   * @returns {Array[NodePath]}
   */
  getAncestry() {
    let path = this;
    const paths = [];
    do {
      paths.push(path);
    } while ((path = path.parentPath));
    return paths;
  }

  /**
   * A helper to find if `this` path is an ancestor of @param {NodePath} maybeDescendant
   * @returns {Boolean}
   */
  isAncestor(maybeDescendant) {
    return maybeDescendant.isDescendant(this);
  }

  /**
   * A helper to find if `this` path is a descendant of @param {NodePath} maybeAncestor
   * @returns {Boolean}
   */
  isDescendant(maybeAncestor) {
    return !!this.findAncestorFromParent(path => path === maybeAncestor);
  }

  // SIBLINGS

  getSiblingNode(index) {
    if (!this.inList) return null;
    return this.container[index];
  }

  /* includes self */
  getSiblingNodes() {
    if (!this.inList) return null;
    return this.container;
  }

  getFirstSiblingNode() {
    if (!this.inList) return null;
    return this.container[0];
  }

  getLastSiblingNode() {
    if (!this.inList) return null;
    return this.container[this.container.length - 1];
  }

  getPrevSiblingNode() {
    return this.getSiblingNode(this.key - 1);
  }

  getNextSiblingNode() {
    return this.getSiblingNode(this.key + 1);
  }

  getAllNextSiblingNodes() {
    if (!this.inList) return null;
    let { index } = this;
    let sibling = this.getSiblingNode(++index);
    const siblings = [];
    while (sibling) {
      siblings.push(sibling);
      sibling = this.getSiblingNode(++index);
    }
    return siblings;
  }

  getAllPrevSiblingNodes() {
    if (!this.inList) return null;
    let { index } = this;
    let sibling = this.getSiblingNode(--index);
    const siblings = [];
    while (sibling) {
      siblings.push(sibling);
      sibling = this.getSiblingNode(--index);
    }
    return siblings;
  }

  // SEARCHES for specific nodeTypes:

  /**
   * @param {string} nodeType - a valid Solidity nodeType.
   * Get the first @return {NodePath || null} matching the given nodeType, in which `this` is contained (including `this` in the search).
   */
  getAncestorOfType(nodeType) {
    return this.findAncestor(path => path.node.nodeType === nodeType);
  }

  /**
   * @param {string} containerName - e.g. parameters, nodes, statements, declarations, imports, ...
   * Get the first @return {NodePath || null} whose containerName matches the given containerName (including `this` in the search)
   */
  getAncestorContainedWithin(containerName) {
    return this.findAncestor(path => path.containerName === containerName);
  }

  /**
   * Callable from any nodeType below (or equal to) a 'SourceUnit' node.
   * @returns {NodePath || null} the parameters of the function.
   */
  getSourceUnit(node = this.node) {
    const path = NodePath.getPath(node);
    return path.getAncestorOfType('SourceUnit') || null;
  }

  /**
   * Callable from any nodeType below (or equal to) a 'ContractDefinition' node.
   * @returns {NodePath || null} the parameters of the function.
   */
  getContractDefinition(node = this.node) {
    const path = NodePath.getPath(node);
    return path.getAncestorOfType('ContractDefinition') || null;
  }

  /**
   * Callable from a ContractDefinition node only
   * @returns {Array[String] || null} the parameters of the function.
   */
  getFunctionNames(contractDefinitionNode = this.node) {
    if (contractDefinitionNode.nodeType !== 'ContractDefinition') return null;
    const entryVisitor = (node, state) => {
      if (node.nodeType !== 'FunctionDefinition') return;
      state.functionNames.push(node.name);
      state.skipSubNodes = true;
    };
    const state = { functionNames: [] };
    traverseNodesFast(contractDefinitionNode, entryVisitor, state);
    return state.functionNames;
  }

  /**
   * Callable from any nodeType below (or equal to) a 'FunctionDefinition' node.
   * @returns {Array[Node] || null} the parameters of the function.
   */
  getFunctionParameters() {
    const functionDefinition = this.getAncestorOfType('FunctionDefinition');
    return functionDefinition?.node?.parameters?.parameters ?? null;
  }

  /**
   * Callable from any nodeType below (or equal to) a 'FunctionDefinition' node.
   * @returns {Array[Node] || null} the parameters of the function.
   */
  getFunctionReturnParameters() {
    const functionDefinition = this.getAncestorOfType('FunctionDefinition');
    return functionDefinition?.node?.returnParameters?.parameters ?? null;
  }

  /**
   * Callable from any nodeType below (or equal to) a 'FunctionDefinition' node.
   * @returns {Array[Node] || null} the statements of the function.
   */
  getFunctionBodyStatements() {
    const functionDefinition = this.getAncestorOfType('FunctionDefinition');
    return functionDefinition?.node?.body?.statements ?? null;
  }

  /**
   * A helper to find if `this` path is a descendant of a particular nodeType or @param {array} nodeTypes
   * @returns {Boolean}
   */
  isInType(...nodeTypes) {
    let path = this;
    while (path) {
      for (const nodeType of nodeTypes) {
        if (path.node.nodeType === nodeType) return true;
      }
      path = path.parentPath;
    }

    return false;
  }

  /**
   * Is this path.node a 'Statement' type?
   * @returns {Boolean}
   */
  isStatement() {
    const statementNodeTypes = [
      'ExpressionStatement',
      'VariableDeclarationStatement',
      'ImportStatementList',
      'ImportStatement',
    ];
    return statementNodeTypes.includes(this.nodeType);
  }

  /**
   * Is this path.node a 'Statement' type which is _within_ a function's body?
   * @returns {Boolean}
   */
  isFunctionBodyStatement() {
    return this.containerName === 'statements';
  }

  /**
   * Is this path.node a descendant of a statement which is _within_ a function's body?
   * @returns {Boolean}
   */
  isInFunctionBodyStatement() {
    return !!this.queryAncestors(path => path.isFunctionBodyStatement());
  }

  isFunctionParameterDeclaration() {
    const functionParameters = this.getFunctionParameters();
    return functionParameters.some(node => node === this.node);
  }

  isFunctionParameter(node = this.node) {
    const referencedBinding = this.scope.getReferencedBinding(node);
    return referencedBinding.path.isFunctionParameterDeclaration();
  }

  isFunctionReturnParameterDeclaration() {
    return (
      this.parent.nodeType === 'ParameterList' && this.parent.containerName === 'returnParameters'
    );
  }

  isFunctionReturnParameter(node = this.node) {
    const referencedBinding = this.scope.getReferencedBinding(node);
    return referencedBinding.path.isFunctionReturnParameterDeclaration();
  }

  // TODO: this will capture `memory` delcarations as well. In future we might want to split out identification of memory (heap) variables from stack variables.
  // NOTE: this does not consider function parameters to be local stack variables.
  isLocalStackVariableDeclaration() {
    return (
      this.isInFunctionBodyStatement() &&
      ['VariableDeclaration', 'VariableDeclarationStatement'].includes(this.nodeType)
    );
  }

  // TODO: this will capture `memory` delcarations as well. In future we might want to split out identification of memory (heap) variables from stack variables.
  // NOTE: this does not consider function parameters to be local stack variables.
  isLocalStackVariable(node = this.node) {
    const referencedBinding = this.scope.getReferencedBinding(node);
    return referencedBinding.path.isLocalStackVariableDeclaration();
  }

  isExternalContractInstanceDeclaration(node = this.node) {
    if (!['VariableDeclaration', 'VariableDeclarationStatement'].includes(node.nodeType))
      return false;
    if (!node.typeDescriptions?.typeString.includes('contract')) return false;

    // Ensure the contract being declared is external:
    const referencedContractId = node.typeName?.referencedDeclaration;
    const thisContractDefinition = this.getContractDefinition(node).node;
    const sourceUnit = this.getSourceUnit(node).node;
    const exportedSymbolsId = sourceUnit?.exportedSymbols?.[thisContractDefinition.name]?.[0];

    if (!exportedSymbolsId) return false;

    return referencedContractId === exportedSymbolsId;
  }

  isExternalContractInstance(node = this.node) {
    const varDecNode = this.getReferencedNode(node);
    return this.isExternalContractInstanceDeclaration(varDecNode);
  }

  isExternalFunctionCall() {
    if (this.nodeType !== 'FunctionCall') return false;
    const { expression: functionNode } = this.node; // the function being called
    // The `expression` for an external function call will be a MemberAccess nodeType. myExternalContract.functionName
    if (functionNode.nodeType !== 'MemberAccess') return false;
    return this.isExternalContractInstance(functionNode);
  }

  /**
   * @returns {String || null} the name of an exported symbol, if one exists for the given `id`
   */
  getReferencedExportedSymbolName(node = this.node) {
    const id = node.referencedDeclaration;
    if (!id) return null;
    const exportedSymbols = this.getSourceUnit()?.node.exportedSymbols;
    if (!exportedSymbols) return null;
    for (const [name, ids] of Object.entries(exportedSymbols)) {
      if (ids.some(_id => _id === id)) return name;
    }
    return null;
  }

  /**
   * Decides whether an expression is an incrementation.
   * E.g. `a = a + b` is an incrementation.
   * E.g. `a + b` is an incrementation.
   * E.g. `a++` is an incrementation.
   * @param {Object} expressionNode - an expression, usually an Assignment nodeType.
   * @param {Object} lhsNode - the left hand side node, usually an Identifier. We're checking whether this lhsNode is being incremented by the expressionNode.
   * @returns {Object {bool, bool}} - { isIncremented, isDecremented }
   */
  isIncrementation(expressionNode = this.node) {}

  /**
   * Decides whether an expression is an incrementation of some node (`lhsNode`).
   * E.g. `a = a + b` is an expression which is an incrementation of `a`.
   * @param {Object} expressionNode - an expression, usually an Assignment nodeType.
   * @param {Object} lhsNode - the left hand side node, usually an Identifier. We're checking whether this lhsNode is being incremented by the expressionNode.
   * @returns {Object {bool, bool}} - { isIncremented, isDecremented }
   */
  isIncrementationOf(lhsNode, expressionNode = this.node) {}

  /**
   * Checks whether a node represents `msg.sender`
   * @param {node} node (optional - defaults to this.node)
   * @returns {Boolean}
   */
  isMsgSender(node = this.node) {
    return (
      node.nodeType === 'MemberAccess' &&
      node.memberName === 'sender' &&
      node.typeDescriptions.typeString === 'address' &&
      this.isMsg(node.expression)
    );
  }

  /**
   * Checks whether a node represents the special solidity type `msg` (e.g. used in `msg.sender`)
   * @param {node} node (optional - defaults to this.node)
   * @returns {Boolean}
   */
  isMsg(node = this.node) {
    return (
      node.nodeType === 'Identifier' &&
      node.name === 'msg' &&
      node.typeDescriptions.typeIdentifier === 't_magic_message' &&
      node.typeDescriptions.typeString === 'msg'
    );
  }

  /**
   * Checks whether a node represents the special solidity keyword `this`
   * @param {node} node (optional - defaults to this.node)
   * @returns {Boolean}
   */
  isThis(node = this.node) {
    return (
      node.nodeType === 'Identifier' &&
      node.name === 'this' &&
      node.referencedDeclaration > 4294967200
    );
  }

  /**
   * Checks whether a node represents an external contract ('exported symbol')
   * @param {node} node (optional - defaults to this.node)
   * @returns {Boolean}
   */
  isExportedSymbol(node = this.node) {
    return !!this.getReferencedExportedSymbolName(node);
  }

  /**
   * Checks whether a node is a VariableDeclaration of a Mapping.
   * @param {node} node (optional - defaults to this.node)
   * @returns {Boolean}
   */
  isMappingDeclaration(node = this.node) {
    if (node.nodeType === 'VariableDeclaration' && node.typeName.nodeType === 'Mapping')
      return true;
    return false;
  }

  /**
   * Checks whether a node is an Identifier for a mapping.
   * @param {node} node (optional - defaults to this.node)
   * @returns {Boolean}
   */
  isMappingIdentifier(node = this.node) {
    if (node.nodeType !== 'IndexAccess') return false;
    // It could be a mapping or it could be an array. The only way to tell is to trace it all the way back to its referencedDeclaration.
    const varDecNode = this.getReferencedNode(node);
    return this.isMappingDeclaration(varDecNode);
  }

  isMapping(node = this.node) {
    return this.isMappingDeclaration(node) || this.isMappingIdentifier(node);
  }

  /**
   * Checks whether a node is a Solidity `require` statement.
   * @param {node} node (optional - defaults to this.node)
   * @returns {Boolean}
   */
  isRequireStatement(node = this.node) {
    /* `require` statements are often contained within the following structure:
        {
          nodeType: 'ExpressionStatement',
          expression: {
            nodeType: 'FunctionCall',
            arguments: [...],
            expression: {
              name: 'require'
            }
          }
        }

        We'll return 'true' for both the `ExpressionStatement` and the `FunctionCall`
     */
    switch (node.nodeType) {
      case 'ExpressionStatement':
        return this.isRequireStatement(node.expression);
      case 'FunctionCall':
        return node.expression.name === 'require';
      case 'Identifier':
        return node.name === 'require' && node.referencedDeclaration > 4294967200; // negative referencedDeclarations are special
      default:
        return false;
    }
  }

  /**
   * Get the referencedDeclaration node id of a particular node.
   * I.e. get the id of the node which the input node references.
   * @param {Node} node - OPTIONAL - the node which references some other node
   * @return {Number || null} - the id of the node being referenced by the input node.
   */
  getReferencedDeclarationId(referencingNode = this.node) {
    const { nodeType } = referencingNode;
    let id;
    switch (nodeType) {
      case 'Identifier':
        id = referencingNode.referencedDeclaration;
        break;
      case 'IndexAccess':
        id = referencingNode.baseExpression.referencedDeclaration;
        break;
      case 'MemberAccess':
        id = referencingNode.expression.referencedDeclaration;
        break;
      default:
        // No other nodeTypes have been encountered which include a referencedDeclaration
        return null;
    }
    return id;
  }

  /**
   * @returns {Node || null} - the node being referred-to by the input referencingNode.
   */
  getReferencedNode(referencingNode = this.node) {
    return this.scope.getReferencedNode(referencingNode);
  }

  /**
   * Slower than querying the `scope` object.
   * Suppose this.node refers to some previously-declared variable. Or suppose `this.node` is the _parent_ or _grandparent_ or earlier _ancestor_ of a node which refers to some previously-declared variable (e.g. a 'statement' node will have subNodes which make the references).
   * This function will collect (within the scope of nodes beneath `beneathNodeType`) all nodePaths which reference the same node(s).
   * @return {Object} = { refDecId: [path, path, path] }, where the array of paths is all paths which refer to the same referenceDeclaration id.
   */
  getAllNodesWhichReferenceTheSame(beneathNodeType = 'Block') {
    // We'll search all subnodes for referencedDeclarations.
    // Later, we'll find nodes `beneathNodeType` which reference the same.
    const state = {};
    const refId = this.node.referencedDeclaration;
    if (refId) {
      state[refId] = [];
    } else {
      const visitor1 = (path, state) => {
        const refId = path.node.referencedDeclaration;
        if (refId) state[refId] = []; // initialise an array to which we'll push nodes which reference the same referencedDeclaration node.
      };
      traversePathsFast(this, visitor1, state);
    }
    if (Object.keys(state).length === 0) return {}; // no references

    const rootNodePath = this.getAncestorOfType(beneathNodeType);
    if (!rootNodePath) return {};

    const visitor2 = (path, state) => {
      for (const refId of Object.keys(state)) {
        if (path.node.referencedDeclaration === refId) state[refId].push(path);
      }
    };
    traversePathsFast(rootNodePath, visitor2, state);
    return state;
  }

  /**
   * Slower than querying the `scope` object.
   * Suppose this.node modifies some previously-declared variable. Or suppose `this.node` is the _parent_ or _grandparent_ or earlier _ancestor_ of a node which modifies some previously-declared variable (e.g. a 'statement' node might have subNodes which make modifications (such as assignment subNodes)).
   * This function will collect (within the scope of nodes beneath `beneathNodeType`) all nodePaths which modify the same node(s).
   * @return {Object} = { refDecId: [path, path, path] }, where the array of paths is all paths which _modify_ the same referenceDeclaration id.
   */
  getAllNodesWhichModifyTheSame(beneathNodeType = 'Block') {
    // We'll search all subnodes for referencedDeclarations on the LHS.
    // Later, we'll find nodes `beneathNodeType` which modify the same nodes.
    const state = {};
    const refId = this.node.referencedDeclaration;
    // TODO: currently, the only 'modification' we care about is a value on the 'leftHandSide' of an assignment node.
    if (refId && this.containerName === 'leftHandSide') {
      state[refId] = [];
    } else {
      const visitor1 = (path, state) => {
        const refId = path.node.referencedDeclaration;
        if (refId && path.containerName === 'leftHandSide') state[refId] = []; // initialise an array to which we'll push nodes which modify the same referencedDeclaration node.
      };
      traversePathsFast(this, visitor1, state);
    }
    if (Object.keys(state).length === 0) return {}; // no references

    const rootNodePath = this.getAncestorOfType(beneathNodeType);
    if (!rootNodePath) return {};

    const visitor2 = (path, state) => {
      for (const refId of Object.keys(state)) {
        if (path.node.referencedDeclaration === refId && path.containerName === 'leftHandSide')
          state[refId].push(path);
      }
    };
    traversePathsFast(rootNodePath, visitor2, state);
    return state;
  }

  // SCOPE

  // checks whether this path's nodeType is one which signals the beginning of a new scope
  isScopable() {
    switch (this.node.nodeType) {
      case 'SourceUnit':
      case 'ContractDefinition':
      case 'FunctionDefinition':
        return true;
      default:
        return false;
    }
  }

  setScope() {
    if (this.node.nodeType === 'SourceUnit') {
      this.scope = new Scope(this);
      return;
    }

    let path = this.parentPath;
    let nearestAncestorScope;
    // move up the path 'tree', until a scope is found
    while (path && !nearestAncestorScope) {
      nearestAncestorScope = path.scope;
      path = path.parentPath;
    }

    nearestAncestorScope.update(this);

    this.scope = this.isScopable() ? new Scope(this) : nearestAncestorScope;
  }
}