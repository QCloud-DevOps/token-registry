const { expect } = require("chai").use(require("chai-as-promised"));
const chai = require("chai");
const { solidity } = require("ethereum-waffle");

chai.use(solidity);

const assertDestroyBurntLog = (logs, tokenId) => {
  expect(logs.event).to.deep.equal("TokenBurnt");
  expect(ethers.BigNumber.from(logs.args[0].toString()).toHexString()).to.deep.equal(tokenId);
};

const assertTokenReceivedLog = (logs, operator, from, tokenId) => {
  expect(logs.event).to.deep.equal("TokenReceived");
  expect(logs.args[0]).to.deep.equal(operator);
  expect(logs.args[1]).to.deep.equal(from);
  expect(ethers.BigNumber.from(logs.args[2].toString()).toHexString()).to.deep.equal(tokenId);
};

describe("TradeTrustErc721", async () => {
  let carrier1;
  let owner1;
  let owner2;
  let nonMinter;
  let holder1;
  let TitleEscrow;
  let Erc721;
  let CalculateSelector;

  before("", async () => {
    const accounts = await ethers.getSigners();
    [carrier1, owner1, owner2, nonMinter, holder1] = accounts;
    TitleEscrow = await ethers.getContractFactory("TitleEscrow");
    Erc721 = await ethers.getContractFactory("TradeTrustERC721");
    CalculateSelector = await ethers.getContractFactory("CalculateTradeTrustERC721Selector");
  });

  const merkleRoot = "0x624d0d7ae6f44d41d368d8280856dbaac6aa29fb3b35f45b80a7c1c90032eeb3";
  const merkleRoot1 = "0x624d0d7ae6f44d41d368d8280856dbaac6aa29fb3b35f45b80a7c1c90032eeb4";
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  const BURN_ADDRESS = "0x000000000000000000000000000000000000dEaD";

  it("should have the correct ERC165 interface support", async () => {
    const tradeTrustERC721Instance = await Erc721.connect(carrier1).deploy("foo", "bar");
    const calculatorInstance = await CalculateSelector.deploy();
    const expectedInterface = await calculatorInstance.calculateSelector();
    const interfaceSupported = await tradeTrustERC721Instance.supportsInterface(expectedInterface);
    expect(interfaceSupported).to.be.equal(true, `Expected selector: ${expectedInterface}`);
  });

  it("should work without a wallet for read operations", async () => {
    const tokenRegistryInstanceWithShippingLine = await Erc721.connect(carrier1).deploy("foo", "bar");
    await tokenRegistryInstanceWithShippingLine.mint(owner1.address, merkleRoot);
    const currentOwner = await tokenRegistryInstanceWithShippingLine.ownerOf(merkleRoot);
    expect(currentOwner).to.deep.equal(owner1.address);
  });

  it("should not burn tokens that it receives", async () => {
    const tokenRegistryInstanceWithShippingLine = await Erc721.connect(carrier1).deploy("foo", "bar");
    await tokenRegistryInstanceWithShippingLine.mint(owner1.address, merkleRoot);
    const currentOwner = await tokenRegistryInstanceWithShippingLine.ownerOf(merkleRoot);
    expect(currentOwner).to.deep.equal(owner1.address);

    await tokenRegistryInstanceWithShippingLine
      .connect(owner1)
      ["safeTransferFrom(address,address,uint256)"](
        owner1.address,
        tokenRegistryInstanceWithShippingLine.address,
        merkleRoot
      );
    const nextOwner = await tokenRegistryInstanceWithShippingLine.ownerOf(merkleRoot);
    expect(nextOwner).to.deep.equal(tokenRegistryInstanceWithShippingLine.address);
  });

  it("should be able to mint", async () => {
    const tokenRegistryInstance = await Erc721.connect(carrier1).deploy("foo", "bar");
    await tokenRegistryInstance.mint(owner1.address, merkleRoot);
    const currentOwner = await tokenRegistryInstance.ownerOf(merkleRoot);
    expect(currentOwner).to.deep.equal(owner1.address);
  });

  it("should be able to transfer", async () => {
    const tokenRegistryInstanceWithShippingLineWallet = await Erc721.connect(carrier1).deploy("foo", "bar");
    await tokenRegistryInstanceWithShippingLineWallet.mint(owner1.address, merkleRoot);
    const currentOwner = await tokenRegistryInstanceWithShippingLineWallet.ownerOf(merkleRoot);
    expect(currentOwner).to.deep.equal(owner1.address);

    await tokenRegistryInstanceWithShippingLineWallet
      .connect(owner1)
      ["safeTransferFrom(address,address,uint256)"](owner1.address, owner2.address, merkleRoot);
    const nextOwner = await tokenRegistryInstanceWithShippingLineWallet.ownerOf(merkleRoot);
    expect(nextOwner).to.deep.equal(owner2.address);
  });

  it("non-owner should not be able to initiate a transfer", async () => {
    const tokenRegistryInstanceWithShippingLine = await Erc721.connect(carrier1).deploy("foo", "bar");
    await tokenRegistryInstanceWithShippingLine.mint(owner1.address, merkleRoot);
    const currentOwner = await tokenRegistryInstanceWithShippingLine.ownerOf(merkleRoot);
    expect(currentOwner).to.deep.equal(owner1.address);

    const transferQuery = tokenRegistryInstanceWithShippingLine["safeTransferFrom(address,address,uint256)"](
      owner1.address,
      tokenRegistryInstanceWithShippingLine.address,
      merkleRoot
    );
    await expect(transferQuery).to.be.revertedWith("transfer caller is not owner nor approved");
  });

  it("should emit TokenReceive event on safeMint", async () => {
    const tokenRegistryInstance = await Erc721.connect(carrier1).deploy("foo", "bar");
    const tokenRegistryInstanceAddress = tokenRegistryInstance.address;
    const mintTx = await (
      await tokenRegistryInstance["safeMint(address,uint256)"](tokenRegistryInstanceAddress, merkleRoot)
    ).wait();
    const receivedTokenLog = mintTx.events.find((log) => log.event === "TokenReceived");
    assertTokenReceivedLog(receivedTokenLog, carrier1.address, ZERO_ADDRESS, merkleRoot, null);
  });

  describe("Surrendered TradeTrustERC721 Work Flow", () => {
    let tokenRegistryInstanceWithShippingLineWallet;
    let tokenRegistryAddress;

    beforeEach(async () => {
      // Starting test after the point of surrendering ERC721 Token
      tokenRegistryInstanceWithShippingLineWallet = await Erc721.connect(carrier1).deploy("foo", "bar");
      tokenRegistryAddress = tokenRegistryInstanceWithShippingLineWallet.address;
      await tokenRegistryInstanceWithShippingLineWallet["safeMint(address,uint256)"](tokenRegistryAddress, merkleRoot);
    });

    it("should be able to destroy token", async () => {
      const destroyTx = await (await tokenRegistryInstanceWithShippingLineWallet.destroyToken(merkleRoot)).wait();
      const burntTokenLog = destroyTx.events.find((log) => log.event === "TokenBurnt");
      assertDestroyBurntLog(burntTokenLog, merkleRoot);
      const currentOwner = tokenRegistryInstanceWithShippingLineWallet.ownerOf(merkleRoot);
      await expect(currentOwner).to.become(BURN_ADDRESS);
    });

    it("non-minter should not be able to destroy token", async () => {
      const attemptDestroyToken = tokenRegistryInstanceWithShippingLineWallet
        .connect(nonMinter)
        .destroyToken(merkleRoot);
      await expect(attemptDestroyToken).to.be.revertedWith("MinterRole: caller does not have the Minter role");
    });

    it("token cannot be destroyed if not owned by registry", async () => {
      await tokenRegistryInstanceWithShippingLineWallet["safeMint(address,uint256)"](owner1.address, merkleRoot1);
      const attemptDestroyToken = tokenRegistryInstanceWithShippingLineWallet.destroyToken(merkleRoot1);
      await expect(attemptDestroyToken).to.be.revertedWith("Cannot destroy token: Token not owned by token registry");
    });

    it("should be able to send token owned by registry", async () => {
      await tokenRegistryInstanceWithShippingLineWallet.sendToken(owner1.address, merkleRoot);
      const currentOwner = await tokenRegistryInstanceWithShippingLineWallet.ownerOf(merkleRoot);
      expect(currentOwner).to.deep.equal(owner1.address);
    });

    it("non-minter should not be able to send token", async () => {
      const attemptSendToken = tokenRegistryInstanceWithShippingLineWallet
        .connect(nonMinter)
        .sendToken(owner1.address, merkleRoot);
      await expect(attemptSendToken).to.be.revertedWith("MinterRole: caller does not have the Minter role");
    });

    it("minter should not be able to send token not owned by registry", async () => {
      await tokenRegistryInstanceWithShippingLineWallet["safeMint(address,uint256)"](owner1.address, merkleRoot1);
      const attemptSendToken = tokenRegistryInstanceWithShippingLineWallet.sendToken(owner2.address, merkleRoot1);
      await expect(attemptSendToken).to.be.revertedWith("Cannot send token: Token not owned by token registry");
    });

    it("should be able to send token to new title escrow", async () => {
      const currentTokenOwner = await tokenRegistryInstanceWithShippingLineWallet.ownerOf(merkleRoot);
      expect(currentTokenOwner).to.deep.equal(tokenRegistryAddress);

      await tokenRegistryInstanceWithShippingLineWallet
        .connect(carrier1)
        .sendToNewTitleEscrow(owner1.address, holder1.address, merkleRoot);
      const nextTokenOwner = await tokenRegistryInstanceWithShippingLineWallet.ownerOf(merkleRoot);
      expect(nextTokenOwner).to.not.deep.equal(currentTokenOwner);

      const newEscrowInstance = await TitleEscrow.attach(nextTokenOwner);
      const escrowBeneficiary = await newEscrowInstance.beneficiary();
      const escrowHolder = await newEscrowInstance.holder();
      const escrowTokenRegistry = await newEscrowInstance.tokenRegistry();
      expect(escrowBeneficiary).to.be.equal(owner1.address);
      expect(escrowHolder).to.be.equal(holder1.address);
      expect(escrowTokenRegistry).to.be.equal(tokenRegistryAddress);
    });

    it("non-minter should not be able to send token to new title escrow", async () => {
      const attemptSendToken = tokenRegistryInstanceWithShippingLineWallet
        .connect(nonMinter)
        .sendToNewTitleEscrow(owner1.address, holder1.address, merkleRoot);
      await expect(attemptSendToken).to.be.revertedWith("MinterRole: caller does not have the Minter role");
    });
  });
});
