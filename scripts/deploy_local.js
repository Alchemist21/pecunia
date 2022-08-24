const hre = require('hardhat')
const network = require('hardhat')
const fs = require('fs')
const { BigNumber } = require('ethers')
const snarkjs = require("snarkjs")

async function main() {
	const accounts = await hre.ethers.getSigners()
	
	// FOR NEW DEPLOYMENT //
	const [deployer, owner, heir] = accounts
	console.log(`owner address ${owner.address}`)
    console.log(`heir address ${heir.address}`)
	
    const PecuniaLockFactory = await ethers.getContractFactory('PecuniaLock')
	const pecunia_lock = await PecuniaLockFactory.deploy()
	await pecunia_lock.deployed()
	console.log('PecuniaLock deployed:', pecunia_lock.address)
	
    const heirTokenFactory = await ethers.getContractFactory('HeirToken');
	const heir_token = await heirTokenFactory.attach(await pecunia_lock.heirToken());
	console.log('Heir Token:', heir_token.address);
    
    const ownerNftFactory = await ethers.getContractFactory('OwnerNFT');
    const owner_token = await ownerNftFactory.deploy();
    await owner_token.deployed();
    console.log(`Owner NFTs deployed at: ${owner_token.address}`);

    const onft_txn = await owner_token.connect(owner).mint(owner.address, "abs");
    console.log(s(onft_txn.value));
    const onft_tokenId = (s(onft_txn.value))

    await printNftOwner(owner_token, onft_tokenId, "owner nft") 
	let psw = 'abc123'
	let settingUpAmount = '0' //hex or int
	let interval = '120'
	let p = await getProof(psw, settingUpAmount, owner);
	await pecunia_lock.connect(owner).register(p.boxhash, p.proof, p.pswHash, p.allHash, interval, {gasLimit: 1e6})
	console.log('register done');

    await printBalances(owner, pecunia_lock, heir)
    await printNftOwner(owner_token, onft_tokenId, "owner nft") 
    let owner_token_ids = [onft_tokenId]
	let amountToHeir = ethers.utils.parseEther("1") //hex or int
    await approveNFT(owner_token, owner, pecunia_lock.address, onft_tokenId)
	const tokenId = await rechargeWithAddress(pecunia_lock, owner, heir.address, amountToHeir, owner_token, owner_token_ids)
	console.log("HEIR token id")
    // console.log(tokenId)
    await printBalances(owner, pecunia_lock, heir)
    await printNftOwner(owner_token, onft_tokenId, "owner nft") 

	const cancel_txn = await pecunia_lock.connect(owner).cancelBoxAndTransferFundsToOwner(owner.address);
	await printBalances(owner, pecunia_lock, heir)
    await printNftOwner(owner_token, onft_tokenId, "owner nft") 

	
	await approveNFT(heir_token, heir, pecunia_lock.address, s(1))
	let p2 = await getProof(psw, s(amountToHeir), owner)
	await pecunia_lock.connect(heir).withdrawSignature(p2.proof, p2.pswHash, p2.allHash, owner.address, {gasLimit: 1e7})
	console.log('withdrawSignature done')
    await printBalances(owner, pecunia_lock, heir)
    await printNftOwner(owner_token, onft_tokenId, "owner nft") 

    // const t_boxHashes = await pecunia_lock.getMaturedBoxes()
    // console.log(`getMaturedBoxes: boxHashes`)
    // console.log(t_boxHashes)
    // const txn = await pecunia_lock.transferAmountToHeirs(t_boxHashes);
    // await printBalances(owner, pecunia_lock, heir)
    // await printNftOwner(owner_token, onft_tokenId, "owner nft")
	// const tt_boxHashes = await pecunia_lock.getMaturedBoxes()
    // console.log(`NEW getMaturedBoxes: boxHashes`)
	// console.log(tt_boxHashes)
}

function stringToHex(string) {
	let hexStr = '';
	for (let i = 0; i < string.length; i++) {
		let compact = string.charCodeAt(i).toString(16)
		hexStr += compact
	}
	return '0x' + hexStr
}

function getAbi(jsonPath) {
	let file = fs.readFileSync(jsonPath)
	let abi = JSON.parse(file.toString()).abi
	return abi
}

async function delay(sec) {
	return new Promise((resolve, reject) => {
		setTimeout(resolve, sec * 1000);
	})
}

function m(num, decimals) {
	return BigNumber.from(num).mul(BigNumber.from(10).pow(decimals))
}

function d(bn, decimals) {
	return bn.mul(BigNumber.from(100)).div(BigNumber.from(10).pow(decimals)).toNumber() / 100
}

function b(num) {
	return BigNumber.from(num)
}

function n(bn) {
	return bn.toNumber()
}

function s(bn) {
	return bn.toString()
}

async function getProof(psw, amount, user) {

	let input = [stringToHex(psw), amount]
	console.log('input', input)

	let data = await snarkjs.groth16.fullProve({in:input}, "./zk/new_circuit/circuit_js/circuit.wasm", "./zk/new_circuit/circuit_0001.zkey")

	// console.log("pswHash: ", data.publicSignals[0])
	console.log(JSON.stringify(data))

	const vKey = JSON.parse(fs.readFileSync("./zk/new_circuit/verification_key.json"))
	const res = await snarkjs.groth16.verify(vKey, data.publicSignals, data.proof)

	if (res === true) {
		console.log("Verification OK")

		let pswHash = data.publicSignals[0]
		let allHash = data.publicSignals[2]
		// console.log(`getProof: user add ${user.address}`)
		let boxhash = ethers.utils.solidityKeccak256(['uint256', 'address'], [pswHash, user.address])

		let proof = [
			BigNumber.from(data.proof.pi_a[0]).toHexString(),
			BigNumber.from(data.proof.pi_a[1]).toHexString(),
			BigNumber.from(data.proof.pi_b[0][1]).toHexString(),
			BigNumber.from(data.proof.pi_b[0][0]).toHexString(),
			BigNumber.from(data.proof.pi_b[1][1]).toHexString(),
			BigNumber.from(data.proof.pi_b[1][0]).toHexString(),
			BigNumber.from(data.proof.pi_c[0]).toHexString(),
			BigNumber.from(data.proof.pi_c[1]).toHexString()
		]

		
		return {proof, pswHash, boxhash, allHash}

	} else {
		console.log("Invalid proof")
	}
}

async function printBalances(
    owner,
    pecunia_lock,
    heir
){
    const owner_bal = await ethers.provider.getBalance(owner.address);
    console.log(`owner balance: ${d(owner_bal, 18)}`)

    const pl_bal = await ethers.provider.getBalance(pecunia_lock.address);
    console.log(`pecunia_lock balance: ${d(pl_bal, 18)}`)

    const heir_bal = await ethers.provider.getBalance(heir.address);
    console.log(`heir balance: ${d(heir_bal, 18)}`)
}

async function printNftOwner(
    nft_token,
    tokenId,
    type
){
    const o = await nft_token.ownerOf(tokenId)
    console.log(`Owner of ${type} NFT: ${o}`)
}


async function approveNFT(
    heirToken,
    user,
    to,
    tokenId
  ){
    await heirToken.connect(user).approve(to, tokenId);
	console.log(`NFT token approved`)
  }

async function moveBlocks(numOfBlocks){
    console.log("Moving blocks.... ")
    for (let i =0; i<= numOfBlocks; i++){
        await network.provider.request({
            method: "evm_mine",
            params: [],
        })
    }
    console.log(` Blocks moved by ${numOfBlocks} `)
}

async function rechargeWithAddress(PecuniaLock, owner, heirAddr, amount,  owner_token, owner_token_ids){
	const tokenId = await PecuniaLock.connect(owner).rechargeWithAddress(owner.address, heirAddr, owner_token.address, ["0"], {value: amount})
	
	console.log('step 2 rechargeWithAddress done')
	return tokenId
}

main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});