/* eslint-disable prettier/prettier, camelcase, prefer-const, no-unused-vars */
import config from "config";
import assert from "assert";

import assign from "./assign.mjs";

import { startEventFilter, getSiblingPath } from "./common/timber.mjs";
import fs from "fs";
import logger from "./common/logger.mjs";
import { decrypt } from "./common/number-theory.mjs";
import {
	getAllCommitments,
	getCommitmentsByState,
	reinstateNullifiers,
	getBalance,
	getBalanceByState,
} from "./common/commitment-storage.mjs";
import Contract from "./common/contract.mjs";
import web3Instance from "./common/web3.mjs";

/**
      NOTE: this is the api service file, if you need to call any function use the correct url and if Your input contract has two functions, add() and minus().
      minus() cannot be called before an initial add(). */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let leafIndex;
let encryption = {};
// eslint-disable-next-line func-names

export async function AssignShield() {
	const web3 = web3Instance.getConnection();
}
// eslint-disable-next-line func-names
export async function service_assign(req, res, next) {
	try {
		// Initialize the contract
		const contract = new Contract("AssignShield");
		await contract.init();

		// Use the initialized Web3 instance and contract instance
		await startEventFilter("AssignShield");

		const contractInstance = contract.getInstance();
		if (!contractInstance) {
			throw new Error("Failed to get contract instance");
		}

		const { value } = req.body;
		const x_newOwnerPublicKey = req.body.x_newOwnerPublicKey || 0;
		const { tx, encEvent } = await assign(value, x_newOwnerPublicKey);
		// prints the tx
		console.log(tx);
		res.send({ tx, encEvent });

		// Update leafIndex with the first commitment added by this function
		if (tx.event) {
			leafIndex = tx.returnValues[0];
			// Print the new leaves (commitments) added by this function call
			console.log(`Merkle tree event returnValues:`);
			console.log(tx.returnValues);
		}

		if (encEvent.event) {
			encryption.msgs = encEvent[0].returnValues[0];
			encryption.key = encEvent[0].returnValues[1];
			console.log("EncryptedMsgs:");
			console.log(encEvent[0].returnValues[0]);
		}

		await sleep(10);
	} catch (err) {
		logger.error(err);
		res.send({ errors: [err.message] });
	}
}

export async function service_allCommitments(req, res, next) {
	try {
		const commitments = await getAllCommitments();
		res.send({ commitments });
		await sleep(10);
	} catch (err) {
		logger.error(err);
		res.send({ errors: [err.message] });
	}
}
export async function service_getBalance(req, res, next) {
	try {
		const sum = await getBalance();
		res.send({ " Total Balance": sum });
	} catch (error) {
		console.error("Error in calculation :", error);
		res.status(500).send({ error: err.message });
	}
}

export async function service_getBalanceByState(req, res, next) {
	try {
		const { name, mappingKey } = req.body;
		const balance = await getBalanceByState(name, mappingKey);
		res.send({ " Total Balance": balance });
	} catch (error) {
		console.error("Error in calculation :", error);
		res.status(500).send({ error: err.message });
	}
}

export async function service_getCommitmentsByState(req, res, next) {
	try {
		const { name, mappingKey } = req.body;
		const commitments = await getCommitmentsByState(name, mappingKey);
		res.send({ commitments });
		await sleep(10);
	} catch (err) {
		logger.error(err);
		res.send({ errors: [err.message] });
	}
}

export async function service_reinstateNullifiers(req, res, next) {
	try {
		await reinstateNullifiers();
		res.send("Complete");
		await sleep(10);
	} catch (err) {
		logger.error(err);
		res.send({ errors: [err.message] });
	}
}
export async function service_getSharedKeys(req, res, next) {
	try {
		const { recipientAddress } = req.body;
		const recipientPubKey = req.body.recipientPubKey || 0;
		const SharedKeys = await getSharedSecretskeys(
			recipientAddress,
			recipientPubKey
		);
		res.send({ SharedKeys });
		await sleep(10);
	} catch (err) {
		logger.error(err);
		res.send({ errors: [err.message] });
	}
}
export async function service_getSharedKeys(req, res, next) {
	try {
		const { recipientAddress } = req.body;
		const recipientPubKey = req.body.recipientPubKey || 0;
		const SharedKeys = await getSharedSecretskeys(
			recipientAddress,
			recipientPubKey
		);
		res.send({ SharedKeys });
		await sleep(10);
	} catch (err) {
		logger.error(err);
		res.send({ errors: [err.message] });
	}
}