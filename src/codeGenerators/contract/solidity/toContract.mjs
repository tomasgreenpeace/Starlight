/* eslint-disable import/no-cycle */

import fs from 'fs';
import path from 'path';
import logger from '../../../utils/logger.mjs';
import ContractBP from '../../../boilerplate/contract/solidity/raw/ContractBoilerplateGenerator.mjs';
import FunctionBP from '../../../boilerplate/contract/solidity/raw/FunctionBoilerplateGenerator.mjs';

const contractBP = new ContractBP();
const functionBP = new FunctionBP();

export const boilerplateContractsDir = './contracts'; // relative to process.cwd() // TODO: move to a config?

/**
 * @param {string} file - a stringified file
 * @param {string} contextDirPath - the import statements of the `file` will be
 * relative to this dir. This path itself is relative to process.cwd().
 * @returns {Object} - { filepath: 'path/to/file.zok', file: 'the code' };
 * The filepath will be used when saving the file into the new zApp's dir.
 */
const collectImportFiles = (file, contextDirPath = boilerplateContractsDir) => {
  const lines = file.split('\n');
  const ImportStatementList = lines.filter(line => line.startsWith('import'));
  let localFiles = [];
  // parse for imports of local files:
  const localFilePaths = ImportStatementList.reduce((acc, line) => {
    let importFilePath = line.match(/"(.*?)"/g)[0].replace(/"/g, ''); // get text between quotes; i.e. the import filepaths
    importFilePath += path.extname(importFilePath) === '.sol' ? '' : '.sol'; // ensure file extension.
    if (importFilePath) acc.push(importFilePath);
    return acc;
  }, []);

  // collect the import files and their paths:
  for (const p of localFilePaths) {
    if (p.includes('IVerifier')) {
      localFilePaths.push('./verify/Verifier.sol');
      localFilePaths.push('./Migrations.sol'); // TODO fix bodge
    }
    const absPath = path.resolve(contextDirPath, p);
    const relPath = path.relative('.', absPath);
    const f = fs.readFileSync(relPath, 'utf8');
    localFiles.push({
      filepath: relPath, // the path to which we'll copy the file.
      file: f,
    });

    localFiles = localFiles.concat(collectImportFiles(f, path.dirname(relPath)));
  }

  // remove duplicate files after recursion:
  const uniqueLocalFiles = localFiles.filter((obj, i, self) => {
    return self.indexOf(obj) === i;
  });

  return uniqueLocalFiles;
};

function codeGenerator(node) {
  // We'll break things down by the `type` of the `node`.
  switch (node.nodeType) {
    case 'Folder': {
      const files = node.files.flatMap(codeGenerator);
      return files;
    }

    // case 'File':
    //   return [
    //     {
    //       filepath: path.join(boilerplateContractsDir, `${node.name}.sol`),
    //       file: codeGenerator(node.sourceUnit),
    //     },
    //   ];

    // case 'VerifierInterfaceFileBoilerplate':
    //   return collectImportFiles();
    //
    // case 'VerifierInterfaceFileBoilerplate':
    //   return verifierInterfaceFileBoilerplate();

    case 'SourceUnit': {
      const license = node.license ? `// SPDX-License-Identifier: ${node.license}` : '';
      const file = `${license}\n\n${node.nodes.map(codeGenerator).join('\n\n')}`;
      let filepath = path.join(boilerplateContractsDir, `${node.name}Shield.sol`);

      if (node.mainPrivateFunctionName) {
        filepath = path.join(
          boilerplateContractsDir,
          `${
            node.mainPrivateFunctionName.charAt(0).toUpperCase() +
            node.mainPrivateFunctionName.slice(1)
          }Shield.sol`,
        );
      }

      const fileData = [
        {
          filepath,
          file,
        },
      ];

      const importFileData = collectImportFiles(file);
      return fileData.concat(importFileData);
    }

    case 'PragmaDirective':
      return `pragma ${node.literals[0]} ${node.literals.slice(1).join('')};`;

    case 'ImportDirective':
      return `import "${node.file}";`;

    case 'ContractDefinition': {
      let name = `${node.name}Shield`;
      if (node.mainPrivateFunctionName) {
        name = `${
          node.mainPrivateFunctionName.charAt(0).toUpperCase() +
          node.mainPrivateFunctionName.slice(1)
        }Shield`;
      }
      const contractDeclaration = `contract ${name}`;
      // TODO: an InheritanceSpecifier is a nodeType in itself, so should be recursed into as its own 'case' in this 'switch' statement.
      const inheritanceSpecifiers = node.baseContracts
        ? ` is ${node.baseContracts
            .reduce((acc, cur) => {
              if (cur.nodeType === 'InheritanceSpecifier') {
                acc.push(cur.baseName.name);
              }
              return acc;
            }, [])
            .join(', ')}`
        : '';
      const nodes = node.nodes.map(codeGenerator).join('\n\n');
      return `${contractDeclaration}${inheritanceSpecifiers} {\n\n${nodes}\n}`;
    }

    case 'FunctionDefinition': {
      // prettier-ignore
      const functionSignature = `${node.name !== 'constructor' ? 'function ' : ''}${node.name} (${codeGenerator(node.parameters)}) ${node.visibility} {`;
      const body = codeGenerator(node.body);
      return `
        ${functionSignature}

          ${body}

        }`;
    }

    case 'ParameterList':
      return node.parameters.flatMap(codeGenerator).filter(Boolean).join(', ');

    case 'VariableDeclaration': {
      let { typeString } = node.typeDescriptions;
      typeString = typeString.replace('contract ', ''); // pesky userdefined type 'contract' keword needs to be removed in some cases.
      const constant = node.constant ? ' constant' : '';
      const visibility = node.visibility ? ` ${node.visibility}` : '';
      const storageLocation =
        !node.storageLocation || node.storageLocation === 'default'
          ? ''
          : ` ${node.storageLocation}`;
      const name = ` ${node.name}`;

      if (node.declarationType === 'parameter') {
        if (node.isSecret) return '';
        return `${typeString}${constant}${storageLocation}${name}`;
      }
      if (node.declarationType === 'localStack') {
        return `${typeString}${constant}${storageLocation}${name}`; // no semicolon
      }
      return `
        ${typeString}${constant}${storageLocation}${visibility}${name};`;
    }

    case 'VariableDeclarationStatement': {
      const declarations = node.declarations.map(codeGenerator).join(', ');
      const initialValue = codeGenerator(node.initialValue);
      return `
          ${declarations} = ${initialValue};`;
    }

    case 'Block': {
      const preStatements = node.preStatements.flatMap(codeGenerator);
      const statements = node.statements.flatMap(codeGenerator);
      const postStatements = node.postStatements.flatMap(codeGenerator);
      return [...preStatements, ...statements, ...postStatements].join('\n');
    }
    case 'ExpressionStatement':
      return codeGenerator(node.expression);

    case 'Assignment':
      return `${codeGenerator(node.leftHandSide)} ${node.operator} ${codeGenerator(
        node.rightHandSide,
      )};`;

    case 'BinaryOperation':
      return `${codeGenerator(node.leftExpression)} ${node.operator} ${codeGenerator(
        node.rightExpression,
      )}`;

    case 'Identifier':
      return node.name;

    case 'Literal':
      return node.kind === 'string' ? `"${node.value}"` : node.value;

    case 'FunctionCall': {
      const expression = codeGenerator(node.expression);
      const args = node.arguments.map(codeGenerator);
      const semicolon = expression === 'require' ? ';' : ''; // HACK. Semicolons get duplicated inserted sometimes, e.g. for nested functioncalls, we get `;,` or for VariableDeclarationStatements with a functioncall on the RHS, we get `;;`.
      return `${expression}(${args.join(', ')})${semicolon}`;
    }

    case 'ElementaryTypeNameExpression':
      return codeGenerator(node.typeName);

    case 'ElementaryTypeName':
      return node.typeDescriptions.typeString;

    case 'MsgSender':
      return 'msg.sender';

    case 'MemberAccess': {
      const expression = codeGenerator(node.expression);
      return `${expression}.${node.memberName}`;
    }

    case 'ContractBoilerplate':
      return contractBP.generateBoilerplate(node).join('\n');

    case 'FunctionBoilerplate':
      return functionBP.generateBoilerplate(node);

    // And if we haven't recognized the node, we'll throw an error.
    default:
      return;
      // throw new TypeError(node.type); // comment out the error until we've written all of the many possible types
  }
}

export { codeGenerator as default };