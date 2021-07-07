const { expect } = require("chai").use(require("chai-as-promised"));

describe("TitleEscrow", async () => {
  let accounts;
  let TitleEscrowFactory;
  let ERC721Factory;
  let CalculateSelectorFactory;
  let TitleEscrowCreatorFactory;

  let carrier1;
  let beneficiary1;
  let beneficiary2;
  let holder1;
  let holder2;

  before("", async () => {
    accounts = await ethers.getSigners();
    TitleEscrowFactory = await ethers.getContractFactory("TitleEscrow");
    ERC721Factory = await ethers.getContractFactory("TradeTrustERC721");
    CalculateSelectorFactory = await ethers.getContractFactory("CalculateSelector");
    TitleEscrowCreatorFactory = await ethers.getContractFactory("TitleEscrowCreator");
    [carrier1, beneficiary1, beneficiary2, holder1, holder2] = accounts;
  });

  const SAMPLE_TOKEN_ID = "0x624d0d7ae6f44d41d368d8280856dbaac6aa29fb3b35f45b80a7c1c90032eeb3";
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

  const assertTransferLog = (logs, from, to) => {
    expect(logs.event).to.deep.equal("Transfer");
    expect(logs.args[0]).to.deep.equal(from);
    expect(logs.args[1]).to.deep.equal(to);
  };
  const assertTitleReceivedLog = (log, tokenRegistry, sender) => {
    expect(log.event).to.deep.equal("TitleReceived");
    expect(log.args[0]).to.deep.equal(tokenRegistry);
    expect(log.args[1]).to.deep.equal(sender);
  };
  const assertTitleCededLog = (log, tokenRegistry, receiver) => {
    expect(log.event).to.deep.equal("TitleCeded");
    expect(log.args[0]).to.deep.equal(tokenRegistry);
    expect(log.args[1]).to.deep.equal(receiver);
  };
  const assertTransferOwnerApprovalLog = (log, sender, receiver) => {
    expect(log.event).to.deep.equal("TransferOwnerApproval");
    expect(log.args[1]).to.deep.equal(sender);
    expect(log.args[2]).to.deep.equal(receiver);
  };
  const assertHolderChangedLog = (log, sender, receiver) => {
    expect(log.event).to.deep.equal("HolderChanged");
    expect(log.args[0]).to.deep.equal(sender);
    expect(log.args[1]).to.deep.equal(receiver);
  };

  let ERC721Address = "";
  let ERC721Instance;

  beforeEach("doot", async () => {
    ERC721Instance = await ERC721Factory.connect(carrier1).deploy("foo", "bar");
    ERC721Address = ERC721Instance.address;
  });

  it("should be instantiated correctly when deployed by beneficiary", async () => {
    const escrowInstance = await TitleEscrowFactory.connect(beneficiary1).deploy(
      ERC721Address,
      beneficiary1.address,
      beneficiary1.address,
      ZERO_ADDRESS
    );

    const escrowBeneficiary = await escrowInstance.beneficiary();
    const escrowHolder = await escrowInstance.holder();
    const escrowTokenRegistry = await escrowInstance.tokenRegistry();
    expect(escrowBeneficiary).to.be.equal(beneficiary1.address);
    expect(escrowHolder).to.be.equal(beneficiary1.address);
    expect(escrowTokenRegistry).to.be.equal(ERC721Address);
  });

  it("should have the correct ERC165 interface support", async () => {
    const escrowInstance = await TitleEscrowFactory.connect(beneficiary1).deploy(
      ERC721Address,
      beneficiary1.address,
      beneficiary1.address,
      ZERO_ADDRESS
    );
    const calculatorInstance = await CalculateSelectorFactory.connect(beneficiary1).deploy();
    const expectedInterface = await calculatorInstance.calculateSelector();
    const interfaceSupported = await escrowInstance.supportsInterface(expectedInterface);
    expect(interfaceSupported).to.be.equal(true, `Expected selector: ${expectedInterface}`);
  });

  it("should be instantiated correctly when deployed by 3rd party to be held by beneficiary1", async () => {
    const escrowInstance = await TitleEscrowFactory.connect(carrier1).deploy(
      ERC721Address,
      beneficiary1.address,
      beneficiary1.address,
      ZERO_ADDRESS
    );

    const escrowBeneficiary = await escrowInstance.beneficiary();
    const escrowHolder = await escrowInstance.holder();
    const escrowTokenRegistry = await escrowInstance.tokenRegistry();
    expect(escrowBeneficiary).to.be.equal(beneficiary1.address);
    expect(escrowHolder).to.be.equal(beneficiary1.address);
    expect(escrowTokenRegistry).to.be.equal(ERC721Address);
  });

  it("should be instantiated correctly when deployed by 3rd party to be held by holder1", async () => {
    const escrowInstance = await TitleEscrowFactory.connect(carrier1).deploy(
      ERC721Address,
      beneficiary1.address,
      holder1.address,
      ZERO_ADDRESS
    );

    const escrowBeneficiary = await escrowInstance.beneficiary();
    const escrowHolder = await escrowInstance.holder();
    const escrowTokenRegistry = await escrowInstance.tokenRegistry();
    expect(escrowBeneficiary).to.be.equal(beneficiary1.address);
    expect(escrowHolder).to.be.equal(holder1.address);
    expect(escrowTokenRegistry).to.be.equal(ERC721Address);
  });

  it("should indicate that it is not holding a token when it has not received one", async () => {
    const escrowInstance = await TitleEscrowFactory.connect(carrier1).deploy(
      ERC721Address,
      beneficiary1.address,
      holder1.address,
      ZERO_ADDRESS
    );

    const approveNewOwnerTx = escrowInstance.connect(beneficiary1).approveNewOwner(beneficiary2.address);

    await expect(approveNewOwnerTx).to.be.rejectedWith(/TitleEscrow: Contract is not holding a token/);
    const changeHolderTx = escrowInstance.connect(holder1).changeHolder(holder2.address);

    await expect(changeHolderTx).to.be.rejectedWith(/TitleEscrow: Contract is not holding a token/);
    const transferTx = escrowInstance.connect(holder1).transferTo(beneficiary2.address);

    await expect(transferTx).to.be.rejectedWith(/TitleEscrow: Contract is not holding a token/);
    const status = await escrowInstance.status();
    expect(status.toString()).to.equal("0");
  });

  it("should update status upon receiving a ERC721 token", async () => {
    const escrowInstance = await TitleEscrowFactory.connect(beneficiary1).deploy(
      ERC721Address,
      beneficiary1.address,
      holder1.address,
      ZERO_ADDRESS
    );
    const mintTx = await (
      await ERC721Instance["safeMint(address,uint256)"](escrowInstance.address, SAMPLE_TOKEN_ID)
    ).wait();
    assertTransferLog(mintTx.events[0], ZERO_ADDRESS, escrowInstance.address);
    const owner = await ERC721Instance.ownerOf(SAMPLE_TOKEN_ID);
    expect(owner).to.equal(escrowInstance.address);

    const status = await escrowInstance.status();
    expect(status.toString()).to.equal("1");
  });

  it("should should fail to receive ERC721 if its from a different registry", async () => {
    const newERC721Instance = await ERC721Factory.connect(beneficiary1).deploy("foo", "bar");

    const escrowInstance = await TitleEscrowFactory.connect(beneficiary1).deploy(
      newERC721Instance.address,
      beneficiary1.address,
      holder1.address,
      ZERO_ADDRESS
    );
    const mintTx = ERC721Instance["safeMint(address,uint256)"](escrowInstance.address, SAMPLE_TOKEN_ID);

    await expect(mintTx).to.be.rejectedWith(/TitleEscrow: Only tokens from predefined token registry can be accepted/);
  });

  it("should allow exit to another title escrow", async () => {
    const escrowInstance1 = await TitleEscrowFactory.connect(beneficiary1).deploy(
      ERC721Address,
      beneficiary1.address,
      beneficiary1.address,
      ZERO_ADDRESS
    );

    const escrowInstance2 = await TitleEscrowFactory.connect(beneficiary2).deploy(
      ERC721Address,
      beneficiary2.address,
      holder2.address,
      ZERO_ADDRESS
    );

    const mintTx = await (
      await ERC721Instance["safeMint(address,uint256)"](escrowInstance1.address, SAMPLE_TOKEN_ID)
    ).wait();

    assertTransferLog(mintTx.events[0], ZERO_ADDRESS, escrowInstance1.address);

    const transferTx = await (await escrowInstance1.transferTo(escrowInstance2.address)).wait();

    assertTitleCededLog(transferTx.events[0], ERC721Instance.address, escrowInstance2.address);
    const newOwner = await ERC721Instance.ownerOf(SAMPLE_TOKEN_ID);
    expect(newOwner).to.be.equal(escrowInstance2.address);
  });

  it("should allow exit to ethereum wallet", async () => {
    const escrowInstance = await TitleEscrowFactory.connect(beneficiary1).deploy(
      ERC721Address,
      beneficiary1.address,
      beneficiary1.address,
      ZERO_ADDRESS
    );

    const mintTx = await (
      await ERC721Instance["safeMint(address,uint256)"](escrowInstance.address, SAMPLE_TOKEN_ID)
    ).wait();

    assertTransferLog(mintTx.events[0], ZERO_ADDRESS, escrowInstance.address);

    const transferTx = await (await escrowInstance.transferTo(beneficiary2.address)).wait();

    assertTitleCededLog(transferTx.events[0], ERC721Instance.address, beneficiary2.address);

    const newOwner = await ERC721Instance.ownerOf(SAMPLE_TOKEN_ID);
    expect(newOwner).to.be.equal(beneficiary2.address);
  });
  it("should allow holder to transfer with beneficiary approval", async () => {
    const escrowInstance = await TitleEscrowFactory.connect(beneficiary1).deploy(
      ERC721Address,
      beneficiary1.address,
      holder1.address,
      ZERO_ADDRESS
    );

    const mintTx = await (
      await ERC721Instance["safeMint(address,uint256)"](escrowInstance.address, SAMPLE_TOKEN_ID)
    ).wait();
    assertTransferLog(mintTx.events[0], ZERO_ADDRESS, escrowInstance.address);

    expect(await escrowInstance.holder()).to.be.equal(holder1.address);

    const approveapproveNewOwnerTx = await (await escrowInstance.approveNewOwner(beneficiary2.address)).wait();

    assertTransferOwnerApprovalLog(approveapproveNewOwnerTx.events[0], beneficiary1.address, beneficiary2.address);

    const tranferOwnerTx = await (await escrowInstance.connect(holder1).transferTo(beneficiary2.address)).wait();

    assertTitleCededLog(tranferOwnerTx.events[0], ERC721Address, beneficiary2.address);

    const newOwner = await ERC721Instance.ownerOf(SAMPLE_TOKEN_ID);

    expect(newOwner).to.be.equal(beneficiary2.address);
  });
  it("should allow holder to transfer to new holder", async () => {
    const escrowInstance = await TitleEscrowFactory.connect(beneficiary1).deploy(
      ERC721Address,
      beneficiary1.address,
      holder1.address,
      ZERO_ADDRESS
    );

    const mintTx = await (
      await ERC721Instance["safeMint(address,uint256)"](escrowInstance.address, SAMPLE_TOKEN_ID)
    ).wait();
    assertTransferLog(mintTx.events[0], ZERO_ADDRESS, escrowInstance.address);

    expect(await escrowInstance.holder()).to.be.equal(holder1.address);

    const transferHolderTx2 = await (await escrowInstance.connect(holder1).changeHolder(holder2.address)).wait();

    assertHolderChangedLog(transferHolderTx2.events[0], holder1.address, holder2.address);

    expect(await escrowInstance.holder()).to.be.equal(holder2.address);
  });

  it("should not allow holder to transfer to 0x0", async () => {
    const escrowInstance = await TitleEscrowFactory.connect(beneficiary1).deploy(
      ERC721Address,
      beneficiary1.address,
      beneficiary1.address,
      ZERO_ADDRESS
    );

    const mintTx = await (
      await ERC721Instance["safeMint(address,uint256)"](escrowInstance.address, SAMPLE_TOKEN_ID)
    ).wait();
    assertTransferLog(mintTx.events[0], ZERO_ADDRESS, escrowInstance.address);

    const attemptToTransferTx = escrowInstance.connect(beneficiary1).transferTo(ZERO_ADDRESS);
    await expect(attemptToTransferTx).to.be.rejectedWith(/TitleEscrow: Transferring to 0x0 is not allowed/);
  });
  it("should not allow holder to transfer to new beneficiary without endorsement", async () => {
    const escrowInstance = await TitleEscrowFactory.connect(beneficiary1).deploy(
      ERC721Address,
      beneficiary1.address,
      holder1.address,
      ZERO_ADDRESS
    );
    const mintTx = await (
      await ERC721Instance["safeMint(address,uint256)"](escrowInstance.address, SAMPLE_TOKEN_ID)
    ).wait();
    assertTransferLog(mintTx.events[0], ZERO_ADDRESS, escrowInstance.address);

    expect(await escrowInstance.holder()).to.be.equal(holder1.address);

    const attemptToTransferOwnerTx = escrowInstance.connect(holder1).transferTo(beneficiary2.address);

    await expect(attemptToTransferOwnerTx).to.be.rejectedWith(
      /TitleEscrow: New owner has not been approved by beneficiary/
    );
  });
  it("should not allow unauthorised party to execute any state change", async () => {
    const escrowInstance = await TitleEscrowFactory.connect(beneficiary1).deploy(
      ERC721Address,
      beneficiary1.address,
      holder1.address,
      ZERO_ADDRESS
    );
    const mintTx = await (
      await ERC721Instance["safeMint(address,uint256)"](escrowInstance.address, SAMPLE_TOKEN_ID)
    ).wait();
    assertTransferLog(mintTx.events[0], ZERO_ADDRESS, escrowInstance.address);

    const attemptToTransferOwnerTx = escrowInstance.connect(beneficiary2).transferTo(holder2.address);

    await expect(attemptToTransferOwnerTx).to.be.rejectedWith(/HasHolder: only the holder may invoke this function/);
    const attemptToTransferHolderTx = escrowInstance.connect(beneficiary2).changeHolder(holder2.address);

    await expect(attemptToTransferHolderTx).to.be.rejectedWith(/HasHolder: only the holder may invoke this function/);
    const attemptToapproveNewOwnerTx = escrowInstance.connect(beneficiary2).approveNewOwner(holder2.address);

    await expect(attemptToapproveNewOwnerTx).to.be.rejectedWith(
      /HasNamedBeneficiary: only the beneficiary may invoke this function/
    );
  });

  it("should lock contract after it has been spent", async () => {
    const escrowInstance1 = await TitleEscrowFactory.connect(beneficiary1).deploy(
      ERC721Address,
      beneficiary1.address,
      beneficiary1.address,
      ZERO_ADDRESS
    );

    const escrowInstance2 = await TitleEscrowFactory.connect(beneficiary2).deploy(
      ERC721Address,
      beneficiary2.address,
      holder2.address,
      ZERO_ADDRESS
    );

    const mintTx = await (
      await ERC721Instance["safeMint(address,uint256)"](escrowInstance1.address, SAMPLE_TOKEN_ID)
    ).wait();
    assertTransferLog(mintTx.events[0], ZERO_ADDRESS, escrowInstance1.address);

    const transferTx = await (await escrowInstance1.transferTo(escrowInstance2.address)).wait();
    assertTitleCededLog(transferTx.events[0], ERC721Address, escrowInstance2.address);
    assertTitleReceivedLog(transferTx.events[2], ERC721Address, escrowInstance1.address);

    const newOwner = await ERC721Instance.ownerOf(SAMPLE_TOKEN_ID);
    expect(newOwner).to.be.equal(escrowInstance2.address);

    const changeHolderTx = escrowInstance1.connect(beneficiary1).changeHolder(holder1.address);

    await expect(changeHolderTx).to.be.rejectedWith(/TitleEscrow: Contract is not in use/);
  });
  it("should not accept a token after it has been used", async () => {
    const escrowInstance1 = await TitleEscrowFactory.connect(beneficiary1).deploy(
      ERC721Address,
      beneficiary1.address,
      beneficiary1.address,
      ZERO_ADDRESS
    );

    const escrowInstance2 = await TitleEscrowFactory.connect(beneficiary2).deploy(
      ERC721Address,
      beneficiary2.address,
      beneficiary2.address,
      ZERO_ADDRESS
    );

    const mintTx = await (
      await ERC721Instance["safeMint(address,uint256)"](escrowInstance1.address, SAMPLE_TOKEN_ID)
    ).wait();
    assertTransferLog(mintTx.events[0], ZERO_ADDRESS, escrowInstance1.address);

    const transferTx = await (await escrowInstance1.connect(beneficiary1).transferTo(escrowInstance2.address)).wait();
    assertTitleCededLog(transferTx.events[0], ERC721Address, escrowInstance2.address);
    assertTitleReceivedLog(transferTx.events[2], ERC721Address, escrowInstance1.address);
    const newOwner = await ERC721Instance.ownerOf(SAMPLE_TOKEN_ID);
    expect(newOwner).to.be.equal(escrowInstance2.address);

    const transferTx2 = escrowInstance2.connect(beneficiary2).transferTo(escrowInstance1.address);

    await expect(transferTx2).to.be.rejectedWith(/TitleEscrow: Contract has been used before/);
  });

  it("should be able to transfer to a new beneficiary and holder instantly", async () => {
    const titleEscrowCreatorInstance = await TitleEscrowCreatorFactory.connect(carrier1).deploy();
    const escrowInstance = await TitleEscrowFactory.connect(beneficiary1).deploy(
      ERC721Address,
      beneficiary1.address,
      beneficiary1.address,
      titleEscrowCreatorInstance.address
    );

    await (await ERC721Instance["safeMint(address,uint256)"](escrowInstance.address, SAMPLE_TOKEN_ID)).wait();

    const receipt = await (
      await escrowInstance.connect(beneficiary1).transferToNewEscrow(beneficiary2.address, holder2.address)
    ).wait();
    const titleCededLog = receipt.events.find((log) => log.event === "TitleCeded");
    const newAddress = titleCededLog.args._to; // eslint-disable-line no-underscore-dangle
    const ownerOnRegistry = await ERC721Instance.ownerOf(SAMPLE_TOKEN_ID);

    expect(escrowInstance.address).not.to.be.equal(newAddress);
    expect(newAddress).to.be.equal(ownerOnRegistry);

    const newEscrowInstance = await TitleEscrowFactory.attach(ownerOnRegistry);
    const escrowBeneficiary = await newEscrowInstance.beneficiary();
    const escrowHolder = await newEscrowInstance.holder();
    const escrowTokenRegistry = await newEscrowInstance.tokenRegistry();
    expect(escrowBeneficiary).to.be.equal(beneficiary2.address);
    expect(escrowHolder).to.be.equal(holder2.address);
    expect(escrowTokenRegistry).to.be.equal(ERC721Address);
  });

  it("should allow current beneficiary to appoint new beneficiary and holder as the transfer target", async () => {
    const titleEscrowCreatorInstance = await TitleEscrowCreatorFactory.connect(carrier1).deploy();
    const escrowInstance = await TitleEscrowFactory.connect(beneficiary1).deploy(
      ERC721Address,
      beneficiary1.address,
      holder1.address,
      titleEscrowCreatorInstance.address
    );

    await (await ERC721Instance["safeMint(address,uint256)"](escrowInstance.address, SAMPLE_TOKEN_ID)).wait();

    const prevApprovedBeneficiary = await escrowInstance.approvedBeneficiary();
    const prevApprovedHolder = await escrowInstance.approvedHolder();
    expect(prevApprovedBeneficiary).to.be.equal(ZERO_ADDRESS);
    expect(prevApprovedHolder).to.be.equal(ZERO_ADDRESS);

    // Execute the transaction to name new beneficiary & holder
    const receipt = await (
      await escrowInstance.connect(beneficiary1).approveNewTransferTargets(beneficiary2.address, holder2.address)
    ).wait();
    expect(receipt.events[0].args.newBeneficiary).to.be.equal(beneficiary2.address);
    expect(receipt.events[0].args.newHolder).to.be.equal(holder2.address);

    const afterApprovedBeneficiary = await escrowInstance.approvedBeneficiary();
    const afterApprovedHolder = await escrowInstance.approvedHolder();
    expect(afterApprovedBeneficiary).to.be.equal(beneficiary2.address);
    expect(afterApprovedHolder).to.be.equal(holder2.address);
  });

  it("should not allow current beneficiary to appoint new beneficiary and holder when the contract is not the owner of a token", async () => {
    const titleEscrowCreatorInstance = await TitleEscrowCreatorFactory.connect(carrier1).deploy();
    const escrowInstance = await TitleEscrowFactory.connect(beneficiary1).deploy(
      ERC721Address,
      beneficiary1.address,
      holder1.address,
      titleEscrowCreatorInstance.address
    );

    const attemptToTransfer = escrowInstance
      .connect(beneficiary1)
      .approveNewTransferTargets(beneficiary2.address, holder2.address);

    await expect(attemptToTransfer).to.be.rejectedWith(/TitleEscrow: Contract is not holding a token/);
  });

  it("should not allow user to appoint new beneficiary and holder when user is not the beneficiary", async () => {
    const titleEscrowCreatorInstance = await TitleEscrowCreatorFactory.connect(carrier1).deploy();
    const escrowInstance = await TitleEscrowFactory.connect(beneficiary1).deploy(
      ERC721Address,
      beneficiary1.address,
      holder1.address,
      titleEscrowCreatorInstance.address
    );

    await (await ERC721Instance["safeMint(address,uint256)"](escrowInstance.address, SAMPLE_TOKEN_ID)).wait();

    const attemptToAppoint = escrowInstance
      .connect(carrier1)
      .approveNewTransferTargets(beneficiary2.address, holder2.address);

    await expect(attemptToAppoint).to.be.rejectedWith(
      /HasNamedBeneficiary: only the beneficiary may invoke this function/
    );
  });

  it("should allow holder to execute transferToNewEscrow when new beneficiary and holder has been appointed by beneficiary", async () => {
    const titleEscrowCreatorInstance = await TitleEscrowCreatorFactory.connect(carrier1).deploy();
    const escrowInstance = await TitleEscrowFactory.connect(beneficiary1).deploy(
      ERC721Address,
      beneficiary1.address,
      holder1.address,
      titleEscrowCreatorInstance.address
    );

    await (await ERC721Instance["safeMint(address,uint256)"](escrowInstance.address, SAMPLE_TOKEN_ID)).wait();

    await (
      await escrowInstance.connect(beneficiary1).approveNewTransferTargets(beneficiary2.address, holder2.address)
    ).wait();

    await (await escrowInstance.connect(holder1).transferToNewEscrow(beneficiary2.address, holder2.address)).wait();

    // Make sure the transfer really has happened
    const ownerOnRegistry = await ERC721Instance.ownerOf(SAMPLE_TOKEN_ID);
    const newEscrowInstance = await TitleEscrowFactory.attach(ownerOnRegistry);
    const escrowBeneficiary = await newEscrowInstance.beneficiary();
    const escrowHolder = await newEscrowInstance.holder();
    const escrowTokenRegistry = await newEscrowInstance.tokenRegistry();
    expect(escrowBeneficiary).to.be.equal(beneficiary2.address);
    expect(escrowHolder).to.be.equal(holder2.address);
    expect(escrowTokenRegistry).to.be.equal(ERC721Address);
  });

  it("should not allow holder to execute transferToNewEscrow when new beneficiary and holder has not been appointed", async () => {
    const titleEscrowCreatorInstance = await TitleEscrowCreatorFactory.connect(carrier1).deploy();
    const escrowInstance = await TitleEscrowFactory.connect(beneficiary1).deploy(
      ERC721Address,
      beneficiary1.address,
      holder1.address,
      titleEscrowCreatorInstance.address
    );

    await (await ERC721Instance["safeMint(address,uint256)"](escrowInstance.address, SAMPLE_TOKEN_ID)).wait();

    const attemptToTransfer = escrowInstance
      .connect(holder1)
      .transferToNewEscrow(beneficiary2.address, holder2.address);

    await expect(attemptToTransfer).to.be.rejectedWith(/TitleEscrow: Beneficiary has not been endorsed by beneficiary/);
  });

  it("should not allow anyone else (esp beneficiary) to execute transferToNewEscrow when new beneficiary and holder has been appointed", async () => {
    const titleEscrowCreatorInstance = await TitleEscrowCreatorFactory.connect(carrier1).deploy();
    const escrowInstance = await TitleEscrowFactory.connect(beneficiary1).deploy(
      ERC721Address,
      beneficiary1.address,
      holder1.address,
      titleEscrowCreatorInstance.address
    );

    await (await ERC721Instance["safeMint(address,uint256)"](escrowInstance.address, SAMPLE_TOKEN_ID)).wait();

    const attemptToTransferByBeneficiay = escrowInstance
      .connect(beneficiary1)
      .transferToNewEscrow(beneficiary2.address, holder2.address);
    await expect(attemptToTransferByBeneficiay).to.be.rejectedWith(
      /HasHolder: only the holder may invoke this function/
    );

    const attemptToTransferByCarrier = escrowInstance
      .connect(carrier1)
      .transferToNewEscrow(beneficiary2.address, holder2.address);
    await expect(attemptToTransferByCarrier).to.be.rejectedWith(/HasHolder: only the holder may invoke this function/);
  });

  it("should not allow holder to execute transferToNewEscrow to other targets not appointed by beneficiary", async () => {
    const titleEscrowCreatorInstance = await TitleEscrowCreatorFactory.connect(carrier1).deploy();
    const escrowInstance = await TitleEscrowFactory.connect(beneficiary1).deploy(
      ERC721Address,
      beneficiary1.address,
      holder1.address,
      titleEscrowCreatorInstance.address
    );

    await (await ERC721Instance["safeMint(address,uint256)"](escrowInstance.address, SAMPLE_TOKEN_ID)).wait();

    await (
      await escrowInstance.connect(beneficiary1).approveNewTransferTargets(beneficiary2.address, holder2.address)
    ).wait();

    const attemptToTransfer = escrowInstance.connect(holder1).transferToNewEscrow(carrier1.address, carrier1.address);

    await expect(attemptToTransfer).to.be.rejectedWith(/TitleEscrow: Beneficiary has not been endorsed by beneficiary/);
  });

  it("should not allow _transferTo to be called by any user", async () => {
    const titleEscrowCreatorInstance = await TitleEscrowCreatorFactory.connect(carrier1).deploy();
    const escrowInstance = await TitleEscrowFactory.connect(beneficiary1).deploy(
      ERC721Address,
      beneficiary1.address,
      holder1.address,
      titleEscrowCreatorInstance.address
    );

    // eslint-disable-next-line no-underscore-dangle
    expect(escrowInstance._transferTo).to.be.undefined;
  });
});
