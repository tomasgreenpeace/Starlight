/* eslint-disable import/no-cycle, no-param-reassign */
import fs from 'fs';
import path from 'path';
import { collectImportFiles, localFile } from '../../common.js'
import buildBoilerplate from '../../../boilerplate/orchestration/javascript/raw/boilerplate-generator.js';
import codeGenerator from '../nodejs/toOrchestration.js';
import logger from '../../../utils/logger.js';


/**
 * Parses the boilerplate import statements, and grabs any common files.
 * @return - { filepath: 'path/to/file.zok', file: 'the code' };
 * The filepath will be used when saving the file into the new zApp's dir.
 */
const editableCommitmentCommonFilesBoilerplate = () => {
  const importBoilerplate = buildBoilerplate('Imports');
  if (!(importBoilerplate instanceof Array)) return;
  return collectImportFiles(importBoilerplate.join(''), 'orchestration');
};

/**
 * @param type - a solidity type
 * @returns - a suitable function input of that type
 */
const testInputsByType = (solidityType: string) => {
  switch (solidityType) {
    case 'uint':
    case 'uint256':
      return Math.floor(Math.random() * Math.floor(200) + 1); // random number between 1 and 200
    case 'address':
      return `config.web3.options.defaultAccount`;
    // return `'this-is-an-address'`;
    case 'key':
      // return `'this-is-a-zkp-key'`;
      return `0`;
    case 'commitment':
      return `0`;
    //  return `'this-is-an-old-commitment'`;
    default:
      return 0;
  }
};

/**
 * @param node - an IntegrationTestBoilerplate node
 * @returns string - a custom integration test file to write
 */

const prepareIntegrationTest = (node: any) => {
  // import generic test skeleton
  const genericTestFile: any = buildBoilerplate(node.nodeType);
  // replace references to contract and functions with ours
  let outputTestFile = genericTestFile.prefix.replace(
    /CONTRACT_NAME/g,
    node.contractName,
  );

  node.functions.forEach((fn: any) => {
    let fnboilerplate = genericTestFile.function
      .replace(/CONTRACT_NAME/g, node.contractName)
      .replace(/FUNCTION_NAME/g, fn.name);
    // we remove the second call to the blockchain if we are decrementing
    // the user may not have enough commitments to do so
    let removeSecondCall = false;
    let removeMerkleTreeTest = false;
    const paramTypes = fn.parameters.parameters.map((obj: any) => obj.typeName.name);
    if (fn.decrementsSecretState) {
      removeSecondCall = true;
    }
    if (!fn.newCommitmentsRequired) {
      removeMerkleTreeTest = true;
    }
    // replace the signature with test inputs
    fnboilerplate = fnboilerplate.replace(
      /FUNCTION_SIG_1/g,
      paramTypes.map(testInputsByType).join(', '),
    );
    fnboilerplate = fnboilerplate.replace(
      /FUNCTION_SIG_2/g,
      paramTypes.map(testInputsByType).join(', '),
    );
    // remove second call
    if (removeSecondCall) {
      // regex: matches everything after `describe('Second Call'`
      const toRemove = fnboilerplate.match(
        /describe\('Second Call'?[\s\S]*/g,
      )[0];
      fnboilerplate = fnboilerplate.replace(toRemove, `\n});`);
    }

    // remove merkle tree test
    if (removeMerkleTreeTest) {
      // regex: matches everything between 'it('should update the merkle tree'' and the first '});'
      const toRemove = fnboilerplate.match(
        /it\('should update the merkle tree'?[\s\S]*?}\);/g,
      )[0];
      fnboilerplate = fnboilerplate.replace(toRemove, `\n`);
    }
    // replace function imports at top of file
    const fnimport = genericTestFile.fnimport.replace(
      /FUNCTION_NAME/g,
      fn.name,
    );
    // for each function, add the new imports and boilerplate to existing test
    outputTestFile = `${fnimport}\n${outputTestFile}\n${fnboilerplate}`;
  });
  // add linting and config
  const preprefix = `/* eslint-disable prettier/prettier, camelcase, prefer-const, no-unused-vars */ \nimport config from 'config';\n`;
  outputTestFile = `${preprefix}\n${outputTestFile}\n${genericTestFile.suffix}\n`;
  return outputTestFile;
};

/**
 * @param file - a generic migrations file skeleton to mutate
 * @param contextDirPath - a SetupCommonFilesBoilerplate node
 */

const prepareMigrationsFile = (file: localFile, node: any) => {
  // insert filepath and replace with our contract and function names
  file.filepath = `./migrations/2_shield.js`;
  file.file = file.file.replace(/CONTRACT_NAME/g, node.contractName);
  file.file = file.file.replace(
    /FUNCTION_NAMES/g,
    `'${node.functionNames.join(`', '`)}'`,
  );
  // collect any extra constructor parameters
  const constructorParams = node.constructorParams?.map((obj: any) => obj.name) || ``;
  // initialise variables
  let customImports = ``;
  let customDeployments = ``;
  let constructorParamsIncludesAddr = false;
  const constructorAddrParams = [];
  // we check weter we must pass in an address to the constructor
  node.constructorParams?.forEach((arg: any) => {
    if (arg.typeName.name === 'address') {
      constructorParamsIncludesAddr = true;
      constructorAddrParams.push(arg.name);
    }
  });
  // we collect any imported contracts which must be migrated
  if (node.contractImports && constructorParamsIncludesAddr) {
    node.contractImports.forEach((importObj: any) => {
      // read each imported contract
      const importedContract = fs.readFileSync(
        `./contracts/${importObj.absolutePath}`,
        'utf8',
      );
      let importedContractName = path.basename(
        importObj.absolutePath,
        path.extname(importObj.absolutePath),
      );
      // if import is an interface, we need to deploy contract e.g. IERC20 -> deploy ERC20
      if (
        importedContractName.startsWith(`I`) &&
        importedContract.replace(/{.*$/, '').includes('interface')
      ) {
        // if we import an interface, we must find the original contract
        // we assume that any interface begins with I (substring(1)) and the remaining chars are the original contract name
        const newPath = importObj.absolutePath.replace(
          importedContractName,
          importedContractName.substring(1),
        );
        importedContractName = importedContractName.substring(1);
        const check = fs.existsSync(`./contracts/${newPath}`);
        if (check) {
          // if we can find the imported contract, we add it to migrations
          customImports += `const ${importedContractName} = artifacts.require("${importedContractName}"); \n`;
          if (
            importedContractName === 'ERC20' ||
            importedContractName === 'ERC721'
          ) {
            // HACK ERC contracts are commonly used, so we support them in migrations
            logger.warn(
              `It looks like you're using an ERC contract - please make sure you increase the allowance of the shield contract before testing!`,
            );
            customDeployments += `await deployer.deploy(${importedContractName}, 'MyCoin', 'MC'); \n`;
          } else {
            customDeployments += `await deployer.deploy(${importedContractName}); \n`;
          }
        }
        // for each address in the shield contract constructor...
        constructorAddrParams.forEach(name => {
          if (
            name
              .toLowerCase()
              .includes(importedContractName.substring(1).toLowerCase()) ||
            importedContractName
              .substring(1)
              .toLowerCase()
              .includes(name.toLowerCase())
          ) {
            // if that address is of the current importedContractName, we add it to the migration arguments
            const index = constructorParams.indexOf(name);
            constructorParams[index] = `${importedContractName}.address`;
          }
        });
      }
    });
  }
  // we need to add a comma if we have a single constructor param
  if (constructorParams?.length === 1) constructorParams[0] += `,`;
  // finally, import all above findings to the migrationsfile
  file.file = file.file.replace(/CUSTOM_CONTRACT_IMPORT/g, customImports);
  file.file = file.file.replace(/CUSTOM_CONTRACTS/g, customDeployments);
  file.file = file.file.replace(/CUSTOM_INPUTS/g, constructorParams);
};

/**
 * @param {string} file - a stringified file
 * @param {string} contextDirPath - the import statements of the `file` will be
 * relative to this dir. This path itself is relative to process.cwd().
 * @returns {Object} - { filepath: 'path/to/file.zok', file: 'the code' };
 * The filepath will be used when saving the file into the new zApp's dir.
 */

export default function fileGenerator(node: any): any {
  // We'll break things down by the `type` of the `node`.
  switch (node.nodeType) {
    case 'Folder': {
      const check = node.files
        .filter((x: any) => x.nodeType !== 'NonSecretFunction')
        .flatMap(fileGenerator);
      return check;
    }

    case 'File':
      return [
        {
          filepath: path.join(
            `./orchestration`,
            `${node.fileName}${node.fileExtension}`,
          ),
          file: node.nodes.map(codeGenerator).join(''),
        },
      ];

    case 'EditableCommitmentCommonFilesBoilerplate': {
      // collects imported files needed for editing commitments
      // direct imports at the top of each fn file
      const check = editableCommitmentCommonFilesBoilerplate();
      return check;
    }

    case 'SetupCommonFilesBoilerplate': {
      // complex setup files which require some setting up:
      const files = collectImportFiles(
        [
          `import './common/write-vk.mjs'`,
          `import './common/zkp-setup.mjs'`,
          `import './common/migrations/2_shield.js'`,
        ].join('\n'),
        'orchestration',
      );
      const vkfile = files.filter(obj => obj.filepath.includes(`write-vk`))[0];
      const setupfile = files.filter(obj =>
        obj.filepath.includes(`zkp-setup`),
      )[0];
      const migrationsfile = files.filter(obj =>
        obj.filepath.includes(`shield`),
      )[0];
      // replace placeholder values with ours
      vkfile.file = vkfile.file.replace(
        /FUNCTION_NAMES/g,
        `'${node.functionNames.join(`', '`)}'`,
      );
      setupfile.file = setupfile.file.replace(
        /FUNCTION_NAMES/g,
        `'${node.functionNames.join(`', '`)}'`,
      );
      // build the migrations file
      prepareMigrationsFile(migrationsfile, node);
      return files;
    }

    case 'IntegrationTestBoilerplate': {
      const test = prepareIntegrationTest(node);
      return test;
    }
    default:
      throw new TypeError(node.type);
  }
}