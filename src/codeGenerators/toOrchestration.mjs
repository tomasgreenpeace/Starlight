import fs from 'fs';
import path from 'path';
import logger from '../utils/logger.mjs';
import {
  OrchestrationCodeBoilerPlate,
  integrationTestBoilerplate,
} from '../boilerplate/orchestration/javascript/raw/toOrchestration.mjs';

const boilerplateNodeDir = './src/boilerplate/';
const testReadPath = './src/boilerplate/common/generic-test.mjs';

/**
 * @param {string} file - a stringified file
 * @param {string} contextDirPath - the import statements of the `file` will be
 * relative to this dir. This path itself is relative to process.cwd().
 * @returns {Object} - { filepath: 'path/to/file.zok', file: 'the code' };
 * The filepath will be used when saving the file into the new zApp's dir.
 */
const collectImportFiles = (file, contextDirPath = boilerplateNodeDir) => {
  const lines = file.split('\n');
  const ImportStatementList = lines.filter(
    line =>
      (line.includes(`.mjs`) || line.includes(`.json`) || line.includes(`shield.js`)) &&
      !line.includes('return') &&
      line.includes('import'),
  );
  let localFiles = [];
  // HERE
  // parse for imports of local (non-zokrates-stdlib) files:
  const localFilePaths = ImportStatementList.reduce((acc, line) => {
    const importFilePath = line.match(/'(.*?)'/g)[0].replace(/'/g, ''); // get text between quotes; i.e. the import filepaths
    acc.push(importFilePath);
    return acc;
  }, []);

  // collect the import files and their paths:
  for (const p of localFilePaths) {
    const absPath = path.resolve(contextDirPath, p);
    const relPath = path.relative('.', absPath);
    const writePath = path.join('orchestration', path.relative('./src/boilerplate', relPath));
    const f = fs.readFileSync(relPath, 'utf8');
    localFiles.push({
      filepath: writePath, // the path to which we'll copy the file.
      file: f,
    });

    localFiles = localFiles.concat(collectImportFiles(f, path.dirname(relPath)));
  }

  const uniqueLocalFiles = [];
  const uniquePaths = [];
  localFiles.forEach(obj => {
    if (!uniquePaths.includes(obj.filepath)) {
      uniqueLocalFiles.push(obj);
      uniquePaths.push(obj.filepath);
    }
  });

  return uniqueLocalFiles;
};

/**
 * Parses the boilerplate import statements, and grabs any common files.
 * @return {Object} - { filepath: 'path/to/file.zok', file: 'the code' };
 * The filepath will be used when saving the file into the new zApp's dir.
 */
const editableCommitmentCommonFilesBoilerplate = () => {
  return collectImportFiles(
    OrchestrationCodeBoilerPlate({ nodeType: 'Imports' }).statements.join(''),
  );
};

const testInputsByType = solidityType => {
  switch (solidityType) {
    case 'uint':
    case 'uint256':
      return Math.floor(Math.random() * Math.floor(20) + 1); // random number between 1 and 20
    case 'address':
      return `'this-is-an-address'`;
    case 'key':
      // return `'this-is-a-zkp-key'`;
      return `0`;
    case 'commitment':
      return `0`;
    //  return `'this-is-an-old-commitment'`;
    default:
      return 0; // TODO
  }
};

const prepareIntegrationTest = node => {
  const genericTestFile = integrationTestBoilerplate;
  let outputTestFile = genericTestFile.prefix.replace(/CONTRACT_NAME/g, node.contractName);
  node.functions.forEach(fn => {
    let fnboilerplate = genericTestFile.function
      .replace(/CONTRACT_NAME/g, node.contractName)
      .replace(/FUNCTION_NAME/g, fn.name);
    // REMOVED below - test file no longer has fn(original_args, zkp args), now fn(original_args)
    // fn sig: original params -> new public keys -> input commitments
    let removeSecondCall = false;
    const paramTypes = fn.parameters.parameters.map(obj => obj.typeName.name);
    fn.parameters.modifiedStateVariables.forEach(param => {
      //   const index = paramTypes.indexOf('key');
      //   if (index > -1) {
      //     paramTypes.splice(index, 0, 'key');
      //   } else {
      //     paramTypes.push('key'); // for each modified state, add a new owner public key
      //   }
      //
      if (param.isDecremented) {
        //     // if dec, we need two input commitments
        //     paramTypes.push('commitment');
        //     paramTypes.push('commitment');
        //     // we should also not do a second call, just in case we don't have enough input commitments
        removeSecondCall = true;
      }
    });
    fnboilerplate = fnboilerplate.replace(
      /FUNCTION_SIG_1/g,
      paramTypes.map(testInputsByType).join(', '),
    );
    fnboilerplate = fnboilerplate.replace(
      /FUNCTION_SIG_2/g,
      paramTypes.map(testInputsByType).join(', '),
    );
    if (removeSecondCall) {
      const toRemove = fnboilerplate.match(/describe\('Second Call'?[\s\S]*/g)[0];
      fnboilerplate = fnboilerplate.replace(toRemove, `\n});`);
    }

    const fnimport = genericTestFile.fnimport.replace(/FUNCTION_NAME/g, fn.name);
    outputTestFile = `${fnimport}\n${outputTestFile}\n${fnboilerplate}`;
  });
  outputTestFile = `${outputTestFile}\n});\n`;
  return outputTestFile;
};

const prepareMigrationsFile = (file, node) => {
  file.filepath = `./migrations/2_shield.js`;
  file.file = file.file.replace(/CONTRACT_NAME/g, node.contractName);
  file.file = file.file.replace(
    /FUNCTION_NAMES/g,
    `'${node.functions.join(`', '`)}'`,
  );
  let customImports = ``;
  let customDeployments = ``;
  const constructorParams = node.constructorParams.map(obj => obj.name);
  let constructorParamsIncludesAddr = false;
  const constructorAddrParams = [];

  if (node.constructorParams) {
    node.constructorParams.forEach(arg => {
      if (arg.typeName.name === 'address') {
        constructorParamsIncludesAddr = true;
        constructorAddrParams.push(arg.name);
      }
    });
  }

  if (node.contractImports && constructorParamsIncludesAddr) {
    node.contractImports.forEach(importObj => {
      const importedContract = fs.readFileSync(`./contracts/${importObj.absolutePath}`, 'utf8');
      let importedContractName = path.basename(
        importObj.absolutePath,
        path.extname(importObj.absolutePath),
      );
      // if import is an interface, we need to deploy contract e.g. IERC20 -> deploy ERC20
      if (
        importedContractName.startsWith(`I`) &&
        importedContract.replace(/{.*$/, '').includes('interface')
      ) {
        const newPath = importObj.absolutePath.replace(
          importedContractName,
          importedContractName.substring(1),
        );
        importedContractName = importedContractName.substring(1);
        const check = fs.existsSync(`./contracts/${newPath}`);
        if (check) {
          customImports += `const ${importedContractName} = artifacts.require("${importedContractName}"); \n`;
          if (importedContractName === 'ERC20') {
            customDeployments += `await deployer.deploy(${importedContractName}, 'MyCoin', 'MC'); \n`; // HACK
          } else {
            customDeployments += `await deployer.deploy(${importedContractName}); \n`;
          }
        }
        constructorAddrParams.forEach(name => {
          if (
            name.toLowerCase().includes(importedContractName.substring(1).toLowerCase()) ||
            importedContractName.substring(1).toLowerCase().includes(name.toLowerCase())
          ) {
            const index = constructorParams.indexOf(name);
            constructorParams[index] = `${importedContractName}.address`;
          }
        });
      }
    });
  }

  if (constructorParams.length === 1) constructorParams[0] += `,`;

  file.file = file.file.replace(/CUSTOM_CONTRACT_IMPORT/g, customImports);
  file.file = file.file.replace(/CUSTOM_CONTRACTS/g, customDeployments);
  file.file = file.file.replace(/CUSTOM_INPUTS/g, constructorParams);

};

// newline / tab beautification for '.zok' files
const beautify = code => {
  // can't be bothered writing this yet
  const lines = code.split('\n');
  let newCode = '';
  let tabCount = 0;
  for (const line of lines) {
    const chars = line.split('');
    let newLine = '';
    for (const char of chars) {
      switch (char) {
        case '[':
          ++tabCount;
          newLine += `${char}\\\n${'\t'.repeat(tabCount)}`;
          break;
        case ']':
          --tabCount;
          newLine += `\\\n${'\t'.repeat(tabCount)}${char}`;
          break;
        default:
          newLine += char;
      }
    }
    newCode += newLine;
  }
  return newCode;
};

function codeGenerator(node) {
  // We'll break things down by the `type` of the `node`.
  const getAccessedValue = name => {
    return `\nlet { ${name} } = ${name}_preimage;`;
  };
  switch (node.nodeType) {
    case 'Folder': {
      const check = node.files
        .filter(x => x.nodeType !== 'NonSecretFunction')
        .flatMap(codeGenerator);
      // console.log("\n\n\n\n\n\n\n\n\ncheck FOLDER:", check);
      return check;
    }

    case 'File':
      return [
        {
          filepath: path.join(`./orchestration`, `${node.name}${node.fileExtension}`),
          file: node.nodes.map(codeGenerator).join(''),
        },
      ];

    case 'EditableCommitmentCommonFilesBoilerplate': {
      const check = editableCommitmentCommonFilesBoilerplate();
      // console.log("\n\n\n\n\n\n\n\n\ncheck EditableCommitmentCommonFilesBoilerplate:", check);
      return check;
    }

    case 'ZokratesSetupCommonFilesBoilerplate': {
      const check = collectImportFiles(
        [
          `import './common/write-vk.mjs'`,
          `import './common/zkp-setup.mjs'`,
          `import './common/migrations/2_shield.js'`,
        ].join('\n'),
      );
      const vkfile = check.filter(obj => obj.filepath.includes(`write-vk`))[0];
      vkfile.file = vkfile.file.replace(/FUNCTION_NAMES/g, `'${node.functions.join(`', '`)}'`);
      const setupfile = check.filter(obj => obj.filepath.includes(`zkp-setup`))[0];
      setupfile.file = setupfile.file.replace(
        /FUNCTION_NAMES/g,
        `'${node.functions.join(`', '`)}'`,
      );
      const migrationsfile = check.filter(obj => obj.filepath.includes(`shield`))[0];
      prepareMigrationsFile(migrationsfile, node);
      // console.log("\n\n\n\n\n\n\n\n\ncheck ZokratesSetupCommonFilesBoilerplate:", check);
      return check;
    }

    case 'IntegrationTestBoilerplate': {
      const check = prepareIntegrationTest(node);
      // console.log("\n\n\n\n\n\n\n\n\ncheck IntegrationTestBoilerplate:", check);
      return check;
    }

    case 'FunctionDefinition': {
      node.inputParameters = node.parameters.parameters.map(codeGenerator);
      node.returnParameters = node.returnParameters.parameters.map(codeGenerator) || [];
      const fn = OrchestrationCodeBoilerPlate(node);
      const statements = codeGenerator(node.body);
      fn.statements.push(statements);
      return `${fn.signature[0]}\n\t${fn.statements.join('')}\n${fn.signature[1]}`;
    }

    case 'ParameterList':
      return node.parameters.map(paramnode => paramnode.name);

    case 'VariableDeclaration': {
      // const isPrivate = node.isPrivate ? 'private ' : '';
      return node.name;
    }

    case 'VariableDeclarationStatement': {
      // const declarations = node.declarations.map(codeGenerator).join(', ');
      // const initialValue = codeGenerator(node.initialValue);
      if (!node.modifiesSecretState) return;
      if (node.initialValue.nodeType === 'Assignment') {
        if (node.declarations[0].isAccessed) {
          return `${getAccessedValue(node.declarations[0].name)}\n${codeGenerator(
            node.initialValue,
          )};`;
        }
        return `\nlet ${codeGenerator(node.initialValue)};`;
      }

      if (node.initialValue.operator && !node.initialValue.operator.includes('='))
        return `\nlet ${node.declarations[0].name} = ${codeGenerator(node.initialValue)};`;
      return `\nlet ${codeGenerator(node.initialValue)};`;
    }

    case 'ElementaryTypeName':
      return;

    case 'Block':
      return node.statements.map(codeGenerator).join('  ');

    case 'ExpressionStatement':
      if (!node.incrementsSecretState) return `\n${codeGenerator(node.expression)};`;
      return `\n// increment would go here but has been filtered out`;

    case 'Assignment':
      return `${codeGenerator(node.leftHandSide)} ${node.operator} ${codeGenerator(
        node.rightHandSide,
      )}`;

    case 'BinaryOperation':
      return `${codeGenerator(node.leftExpression)} ${node.operator} ${codeGenerator(
        node.rightExpression,
      )}`;

    case 'Literal':
    case 'Identifier':
      return node.name;
    case 'InitialisePreimage':
    case 'ReadPreimage':
    case 'WritePreimage':
    case 'MembershipWitness':
    case 'CalculateNullifier':
    case 'CalculateCommitment':
    case 'GenerateProof':
    case 'SendTransaction':
    case 'Imports':
    case 'KeyRegistrationFunction':
      return `${OrchestrationCodeBoilerPlate(node).statements.join('')}`;
    // And if we haven't recognized the node, we'll throw an error.
    default:
      return;
    // throw new TypeError(node.type); // comment out the error until we've written all of the many possible types
  }
}

export { codeGenerator as default };