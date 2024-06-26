/* eslint-disable prettier/prettier, camelcase, prefer-const, no-unused-vars */
import config from "config";
import utils from "zkp-utils";
import GN from "general-number";
import fs from "fs";

import {
	getContractInstance,
	getContractAddress,
	registerKey,
} from "./common/contract.mjs";
import {
	storeCommitment,
	getCurrentWholeCommitment,
	getCommitmentsById,
	getAllCommitments,
	getInputCommitments,
	joinCommitments,
	splitCommitments,
	markNullified,
	getnullifierMembershipWitness,
	getupdatedNullifierPaths,
	temporaryUpdateNullifier,
	updateNullifierTree,
} from "./common/commitment-storage.mjs";
import { generateProof } from "./common/zokrates.mjs";
import { getMembershipWitness, getRoot } from "./common/timber.mjs";
import Web3 from "./common/web3.mjs";
import {
	decompressStarlightKey,
	poseidonHash,
} from "./common/number-theory.mjs";

const { generalise } = GN;
const db = "/app/orchestration/common/db/preimage.json";
const web3 = Web3.connection();
const keyDb = "/app/orchestration/common/db/key.json";

export default async function remove1(
	_value,
	_a_newOwnerPublicKey = 0,
	_a_0_oldCommitment = 0,
	_a_1_oldCommitment = 0
) {
	// Initialisation of variables:

	const instance = await getContractInstance("AssignShield");

	const contractAddr = await getContractAddress("AssignShield");

	const msgValue = 0;
	const value = generalise(_value);
	let a_newOwnerPublicKey = generalise(_a_newOwnerPublicKey);

	// Read dbs for keys and previous commitment values:

	if (!fs.existsSync(keyDb))
		await registerKey(utils.randomHex(31), "AssignShield", false);
	const keys = JSON.parse(
		fs.readFileSync(keyDb, "utf-8", (err) => {
			console.log(err);
		})
	);
	const secretKey = generalise(keys.secretKey);
	const publicKey = generalise(keys.publicKey);

	// read preimage for decremented state

	a_newOwnerPublicKey =
		_a_newOwnerPublicKey === 0 ? publicKey : a_newOwnerPublicKey;

	const a_stateVarId = generalise(3).hex(32);

	let a_preimage = await getCommitmentsById(a_stateVarId);

	const a_newCommitmentValue = generalise(parseInt(value.integer, 10));
	// First check if required commitments exist or not

	let [
		a_commitmentFlag,
		a_0_oldCommitment,
		a_1_oldCommitment,
	] = getInputCommitments(
		publicKey.hex(32),
		a_newCommitmentValue.integer,
		a_preimage
	);

	let a_witness_0;

	let a_witness_1;

	if (a_1_oldCommitment === null && a_commitmentFlag) {
		a_witness_0 = await getMembershipWitness(
			"AssignShield",
			generalise(a_0_oldCommitment._id).integer
		);

		const tx = await splitCommitments(
			"AssignShield",
			"a",
			a_newCommitmentValue,
			secretKey,
			publicKey,
			[a_stateVarId],
			a_0_oldCommitment,
			a_witness_0,
			instance,
			contractAddr,
			web3
		);
		a_preimage = await getCommitmentsById(a_stateVarId);

		[
			a_commitmentFlag,
			a_0_oldCommitment,
			a_1_oldCommitment,
		] = getInputCommitments(
			publicKey.hex(32),
			a_newCommitmentValue.integer,
			a_preimage
		);
	}

	while (a_commitmentFlag === false) {
		a_witness_0 = await getMembershipWitness(
			"AssignShield",
			generalise(a_0_oldCommitment._id).integer
		);

		a_witness_1 = await getMembershipWitness(
			"AssignShield",
			generalise(a_1_oldCommitment._id).integer
		);

		const tx = await joinCommitments(
			"AssignShield",
			"a",
			secretKey,
			publicKey,
			[a_stateVarId],
			[a_0_oldCommitment, a_1_oldCommitment],
			[a_witness_0, a_witness_1],
			instance,
			contractAddr,
			web3
		);

		a_preimage = await getCommitmentsById(a_stateVarId);

		[
			a_commitmentFlag,
			a_0_oldCommitment,
			a_1_oldCommitment,
		] = getInputCommitments(
			publicKey.hex(32),
			a_newCommitmentValue.integer,
			a_preimage
		);
	}
	const a_0_prevSalt = generalise(a_0_oldCommitment.preimage.salt);
	const a_1_prevSalt = generalise(a_1_oldCommitment.preimage.salt);
	const a_0_prev = generalise(a_0_oldCommitment.preimage.value);
	const a_1_prev = generalise(a_1_oldCommitment.preimage.value);

	// Extract set membership witness:

	// generate witness for partitioned state
	a_witness_0 = await getMembershipWitness(
		"AssignShield",
		generalise(a_0_oldCommitment._id).integer
	);
	a_witness_1 = await getMembershipWitness(
		"AssignShield",
		generalise(a_1_oldCommitment._id).integer
	);
	const a_0_index = generalise(a_witness_0.index);
	const a_1_index = generalise(a_witness_1.index);
	const a_root = generalise(a_witness_0.root);
	const a_0_path = generalise(a_witness_0.path).all;
	const a_1_path = generalise(a_witness_1.path).all;

	// increment would go here but has been filtered out

	// Calculate nullifier(s):

	let a_0_nullifier = poseidonHash([
		BigInt(a_stateVarId),
		BigInt(secretKey.hex(32)),
		BigInt(a_0_prevSalt.hex(32)),
	]);
	let a_1_nullifier = poseidonHash([
		BigInt(a_stateVarId),
		BigInt(secretKey.hex(32)),
		BigInt(a_1_prevSalt.hex(32)),
	]);
	a_0_nullifier = generalise(a_0_nullifier.hex(32)); // truncate
	a_1_nullifier = generalise(a_1_nullifier.hex(32)); // truncate
	// Non-membership witness for Nullifier
	const a_0_nullifier_NonMembership_witness = getnullifierMembershipWitness(
		a_0_nullifier
	);
	const a_1_nullifier_NonMembership_witness = getnullifierMembershipWitness(
		a_1_nullifier
	);

	const a_nullifierRoot = generalise(a_0_nullifier_NonMembership_witness.root);
	const a_0_nullifier_path = generalise(
		a_0_nullifier_NonMembership_witness.path
	).all;
	const a_1_nullifier_path = generalise(
		a_1_nullifier_NonMembership_witness.path
	).all;

	await temporaryUpdateNullifier(a_0_nullifier);
	await temporaryUpdateNullifier(a_1_nullifier);

	// Get the new updated nullifier Paths
	const a_0_updated_nullifier_NonMembership_witness = getupdatedNullifierPaths(
		a_0_nullifier
	);
	const a_1_updated_nullifier_NonMembership_witness = getupdatedNullifierPaths(
		a_1_nullifier
	);

	const a_newNullifierRoot = generalise(
		a_0_updated_nullifier_NonMembership_witness.root
	);
	const a_0_nullifier_updatedpath = generalise(
		a_0_updated_nullifier_NonMembership_witness.path
	).all;
	const a_1_nullifier_updatedpath = generalise(
		a_1_updated_nullifier_NonMembership_witness.path
	).all;

	// Calculate commitment(s):

	const a_2_newSalt = generalise(utils.randomHex(31));

	let a_change =
		parseInt(a_0_prev.integer, 10) +
		parseInt(a_1_prev.integer, 10) -
		parseInt(a_newCommitmentValue.integer, 10);

	a_change = generalise(a_change);

	let a_2_newCommitment = poseidonHash([
		BigInt(a_stateVarId),
		BigInt(a_change.hex(32)),
		BigInt(publicKey.hex(32)),
		BigInt(a_2_newSalt.hex(32)),
	]);

	a_2_newCommitment = generalise(a_2_newCommitment.hex(32)); // truncate

	// Call Zokrates to generate the proof:

	const allInputs = [
		value.integer,
		secretKey.integer,
		secretKey.integer,
		a_nullifierRoot.integer,
		a_newNullifierRoot.integer,
		a_0_nullifier.integer,
		a_0_nullifier_path.integer,
		a_0_nullifier_updatedpath.integer,
		a_1_nullifier.integer,
		a_1_nullifier_path.integer,
		a_1_nullifier_updatedpath.integer,
		a_0_prev.integer,
		a_0_prevSalt.integer,
		a_1_prev.integer,
		a_1_prevSalt.integer,
		a_root.integer,
		a_0_index.integer,
		a_0_path.integer,
		a_1_index.integer,
		a_1_path.integer,
		a_newOwnerPublicKey.integer,
		a_2_newSalt.integer,
		a_2_newCommitment.integer,
	].flat(Infinity);
	const res = await generateProof("remove1", allInputs);
	const proof = generalise(Object.values(res.proof).flat(Infinity))
		.map((coeff) => coeff.integer)
		.flat(Infinity);

	// Send transaction to the blockchain:

	const txData = await instance.methods
		.remove1(
			a_nullifierRoot.integer,
			a_newNullifierRoot.integer,
			[a_0_nullifier.integer, a_1_nullifier.integer],
			a_root.integer,
			[a_2_newCommitment.integer],
			proof
		)
		.encodeABI();

	let txParams = {
		from: config.web3.options.defaultAccount,
		to: contractAddr,
		gas: config.web3.options.defaultGas,
		gasPrice: config.web3.options.defaultGasPrice,
		data: txData,
		chainId: await web3.eth.net.getId(),
	};

	const key = config.web3.key;

	const signed = await web3.eth.accounts.signTransaction(txParams, key);

	const sendTxn = await web3.eth.sendSignedTransaction(signed.rawTransaction);

	let tx = await instance.getPastEvents("NewLeaves");

	tx = tx[0];

	if (!tx) {
		throw new Error(
			"Tx failed - the commitment was not accepted on-chain, or the contract is not deployed."
		);
	}

	let encEvent = "";

	try {
		encEvent = await instance.getPastEvents("EncryptedData");
	} catch (err) {
		console.log("No encrypted event");
	}

	// Write new commitment preimage to db:

	await markNullified(generalise(a_0_oldCommitment._id), secretKey.hex(32));

	await markNullified(generalise(a_1_oldCommitment._id), secretKey.hex(32));

	await storeCommitment({
		hash: a_2_newCommitment,
		name: "a",
		mappingKey: null,
		preimage: {
			stateVarId: generalise(a_stateVarId),
			value: a_change,
			salt: a_2_newSalt,
			publicKey: a_newOwnerPublicKey,
		},
		secretKey:
			a_newOwnerPublicKey.integer === publicKey.integer ? secretKey : null,
		isNullified: false,
	});

	return { tx, encEvent };
}