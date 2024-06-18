// SPDX-License-Identifier: CC0

pragma solidity ^0.8.0;

import "./verify/IVerifier.sol";
import "./merkle-tree/MerkleTree.sol";

contract MyContractShield is MerkleTree {


          enum FunctionNames { cnstrctr, setAdmin }

          IVerifier private verifier;

          mapping(uint256 => uint256[]) public vks; // indexed to by an enum uint(FunctionNames)

          uint256 public newNullifierRoot;

          mapping(uint256 => uint256) public commitmentRoots;

          uint256 public latestRoot;

          mapping(address => uint256) public zkpPublicKeys;

          struct Inputs {
            uint nullifierRoot; 
              uint latestNullifierRoot; 
              uint[] newNullifiers;
                  
						uint commitmentRoot;
						uint[] newCommitments;
						uint[] customInputs;
          }


        function registerZKPPublicKey(uint256 pk) external {
      		zkpPublicKeys[msg.sender] = pk;
      	}
        


        function verify(
      		uint256[] memory proof,
      		uint256 functionId,
      		Inputs memory _inputs
      	) private {
        
          uint[] memory customInputs = _inputs.customInputs;

          uint[] memory newNullifiers = _inputs.newNullifiers;

          uint[] memory newCommitments = _inputs.newCommitments;

          require(commitmentRoots[_inputs.commitmentRoot] == _inputs.commitmentRoot, "Input commitmentRoot does not exist.");

            uint256[] memory inputs = new uint256[](customInputs.length + newNullifiers.length + (newNullifiers.length > 0 ? 3 : 0) + newCommitments.length);
          
          if (functionId == uint(FunctionNames.cnstrctr)) {
            uint k = 0;
             
            require(newNullifierRoot == _inputs.nullifierRoot, "Input NullifierRoot does not exist.");
            inputs[k++] = customInputs[0];
            inputs[k++] = _inputs.nullifierRoot;
            inputs[k++] = _inputs.latestNullifierRoot;
            inputs[k++] = newNullifiers[0];
            inputs[k++] = _inputs.commitmentRoot;
            inputs[k++] = newCommitments[0];
            inputs[k++] = 1;
            
          }

          if (functionId == uint(FunctionNames.setAdmin)) {
            uint k = 0;
             
            require(newNullifierRoot == _inputs.nullifierRoot, "Input NullifierRoot does not exist.");
            inputs[k++] = customInputs[0];
            inputs[k++] = _inputs.nullifierRoot;
            inputs[k++] = _inputs.latestNullifierRoot;
            inputs[k++] = newNullifiers[0];
            inputs[k++] = _inputs.commitmentRoot;
            inputs[k++] = newCommitments[0];
            inputs[k++] = newNullifiers[1];
            inputs[k++] = newCommitments[1];
            inputs[k++] = 1;
            
          }
          
          bool result = verifier.verify(proof, inputs, vks[functionId]);

          require(result, "The proof has not been verified by the contract");

          if (newCommitments.length > 0) {
      			latestRoot = insertLeaves(newCommitments);
      			commitmentRoots[latestRoot] = latestRoot;
      		}

       if (newNullifiers.length > 0) {
        newNullifierRoot = _inputs.latestNullifierRoot;
      }
        }







      constructor  (address verifierAddress, uint256[][] memory vk, uint256 nullifierRoot, uint256 latestNullifierRoot,uint256[] memory newNullifiers, uint256 commitmentRoot, uint256[] memory newCommitments, uint256[] memory proof)   {

         verifier = IVerifier(verifierAddress);
    		  for (uint i = 0; i < vk.length; i++) {
    			  vks[i] = vk[i];
    		  }
          newNullifierRoot = Initial_NullifierRoot;

          Inputs memory inputs;

          inputs.customInputs = new uint[](2);
        	inputs.customInputs[0] = uint256(uint160(address(msg.sender)));
inputs.customInputs[1] = 1;

        inputs.nullifierRoot = nullifierRoot; 

        inputs.latestNullifierRoot = latestNullifierRoot; 

          inputs.newNullifiers = newNullifiers;
           

          inputs.commitmentRoot = commitmentRoot;

          inputs.newCommitments = newCommitments;

          

          verify(proof, uint(FunctionNames.cnstrctr), inputs);

      }


      function setAdmin (uint256 nullifierRoot, uint256 latestNullifierRoot,uint256[] calldata newNullifiers, uint256 commitmentRoot, uint256[] calldata newCommitments, uint256[] calldata proof) public  {

        
          Inputs memory inputs;

          inputs.customInputs = new uint[](2);
        	inputs.customInputs[0] = uint256(uint160(address(msg.sender)));
inputs.customInputs[1] = 1;

        inputs.nullifierRoot = nullifierRoot; 

        inputs.latestNullifierRoot = latestNullifierRoot; 

          inputs.newNullifiers = newNullifiers;
           

          inputs.commitmentRoot = commitmentRoot;

          inputs.newCommitments = newCommitments;

           verify(proof, uint(FunctionNames.setAdmin), inputs);


      }
}