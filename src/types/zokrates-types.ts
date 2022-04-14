/* eslint-disable consistent-return */
import CircuitBP from '../boilerplate/circuit/zokrates/nodes/BoilerplateGenerator.js';
import { StateVariableIndicator } from '../traverse/Indicator.js';

const generateBoilerplate = ({ indicators, bpSection }) => {
  const bpArray = [];
  // FIXME: this might be the problem. We're cycling through by stateVar then by section, when in fact maybe the _class_ should manage the spitting out nodes, first by section, then by stateVar.
  for (const indicatorObj of Object.values(indicators)) {
    if (!(indicatorObj instanceof StateVariableIndicator) || !indicatorObj.isSecret) continue; // eslint-disable-line no-continue
    const bp = new CircuitBP(indicatorObj);
    bpArray.push(...bp[bpSection]);
  }
  return bpArray;
};

const generateBoilerplateStatement = fields => {
  const { bpType, indicators } = fields;
  const bp = new CircuitBP(indicators);
  return bp.generateBoilerplateStatement(bpType, fields);
};

/**
 * @param {string} nodeType - the type of node you'd like to build
 * @param {Object} fields - important key, value pairs to include in the node, and which enable the rest of the node's info to be derived. How do you know which data to include in `fields`? Read this function.
 */
export function buildNode(nodeType: string, fields: any = {}): any {
  switch (nodeType) {
    case 'File': {
      const { fileName, fileId, nodes = [] } = fields;
      return {
        nodeType,
        fileName,
        fileId,
        fileExtension: '.zok',
        nodes,
      };
    }
    case 'ImportStatementList': {
      const { imports = [] } = fields;
      return {
        nodeType,
        imports,
      };
    }
    case 'FunctionDefinition': {
      // prettier-ignore
      const {
        name,
        body = buildNode('Block'),
        parameters = buildNode('ParameterList')
      } = fields;
      return {
        nodeType,
        name,
        body,
        parameters,
        // Notice no return parameters. Although zokrates _can_ return parameters, we've chosen to transpile in such a way that all parameters are _input_ parameters to the circuit.
      };
    }
    case 'ParameterList': {
      const { parameters = [] } = fields;
      return {
        nodeType,
        parameters,
      };
    }
    case 'Block': {
      const { preStatements = [], statements = [], postStatements = [] } = fields;
      return {
        nodeType,
        preStatements,
        statements,
        postStatements,
      };
    }
    case 'VariableDeclaration': {
      const { name, type, isSecret: isPrivate = false, interactsWithSecret, declarationType } = fields;
      return {
        nodeType,
        name,
        isPrivate, // 'private' to match zokrates keyword
        interactsWithSecret,
        declarationType,
        typeName: buildNode('ElementaryTypeName', { name: type }),
      };
    }
    case 'VariableDeclarationStatement': {
      const { declarations = [], initialValue = {}, interactsWithSecret } = fields;
      return {
        nodeType,
        declarations,
        initialValue,
        interactsWithSecret,
      };
    }
    case 'BinaryOperation': {
      const { leftExpression = {}, operator, rightExpression = {} } = fields;
      return {
        nodeType,
        leftExpression,
        operator,
        rightExpression,
      };
    }
    case 'Assignment': {
      const { leftHandSide = {}, operator, rightHandSide = {} } = fields;
      return {
        nodeType,
        operator,
        leftHandSide,
        rightHandSide,
      };
    }
    case 'ExpressionStatement': {
      const { expression = {}, isVarDec = false } = fields;
      return {
        nodeType,
        expression,
        isVarDec, // this informs the codeGenerator that it should _declare_ the lhs of the assignment (below this expressionStatement) as a field.
      };
    }
    case 'IndexAccess': {
      const { baseExpression = {}, indexExpression = {} } = fields;
      return {
        nodeType,
        baseExpression,
        indexExpression,
      };
    }
    case 'TupleExpression': {
      const { components = [] } = fields;
      return {
        nodeType,
        components,
      }
    }
    case 'UnaryOperation': {
      const { operator, prefix, subExpression = {} } = fields;
      return {
        nodeType,
        operator,
        prefix,
        subExpression,
      };
    }
    case 'MsgSender': {
      return {
        nodeType,
      };
    }
    case 'Identifier': {
      const { name } = fields;
      return {
        nodeType,
        name,
      };
    }
    case 'Literal': {
      const { value } = fields;
      return {
        nodeType,
        value,
      };
    }
    case 'ElementaryTypeName': {
      const { name } = fields;
      return {
        nodeType,
        name,
      };
    }
    case 'InternalFunctionCall': {
      const { name, internalFunctionInteractsWithSecret = false, oldStateName = [], newStateName =[], CircuitArguments = []} = fields;
      return{
        nodeType,
        name,
        internalFunctionInteractsWithSecret,
        oldStateName,
        newStateName,
        CircuitArguments
      };

    }
    case 'InternalFunctionBoilerplate':{
      const { name, internalFunctionInteractsWithSecret = false,circuitImport = false} = fields;
      return{
        nodeType: 'Boilerplate',
        bpSection: 'importStatements',
        bpType: 'internalFunctionCall',
        name,
        internalFunctionInteractsWithSecret,
        circuitImport,
      };

    }
    case 'Assert': {
      // A very specific zokrates nodeType, which is similar to a Solidity 'require' statement. It asserts a truth.
      const { arguments: args } = fields; // we have to 'tip-toe' around the reserved JS keyword 'arguments'!
      return {
        nodeType,
        args,
      };
    }
    case 'SetupCommonFilesBoilerplate':
    case 'Boilerplate': {
      // This nodeType will be understood by the codeGenerator, where raw boilerplate code will be inserted.
      return generateBoilerplate(fields);
    }
    case 'BoilerplateStatement': {
      // This nodeType will be understood by the codeGenerator, where raw boilerplate code will be inserted.
      return generateBoilerplateStatement(fields);
    }
    default:
      throw new TypeError(nodeType);
  }
}
