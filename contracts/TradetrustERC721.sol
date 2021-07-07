pragma solidity ^0.5.16;

import "./ERC721.sol";
import "./TitleEscrow.sol";
import "./ITitleEscrowCreator.sol";

// Everything above is imported from OpenZeppelin ERC721 implementation
contract TitleEscrowCreator is ITitleEscrowCreator {
  event TitleEscrowDeployed(
    address indexed escrowAddress,
    address indexed tokenRegistry,
    address beneficiary,
    address holder
  );

  function deployNewTitleEscrow(
    address tokenRegistry,
    address beneficiary,
    address holder
  ) external returns (address) {
    TitleEscrow newEscrow = new TitleEscrow(ERC721(tokenRegistry), beneficiary, holder, address(this));
    emit TitleEscrowDeployed(address(newEscrow), tokenRegistry, beneficiary, holder);
    return address(newEscrow);
  }
}

contract TradeTrustERC721 is TitleEscrowCreator, ERC721MintableFull, IERC721Receiver {
  event TokenBurnt(uint256 indexed tokenId);
  event TokenReceived(address indexed operator, address indexed from, uint256 indexed tokenId, bytes data);

  // ERC165: Interface for this contract, can be calculated by CalculateTradeTrustERC721Selector()
  // Only append new interface id for backward compatibility
  bytes4 private constant _INTERFACE_ID_TRADETRUST_ERC721 = 0x9f9e69f3;

  constructor(string memory name, string memory symbol) public ERC721MintableFull(name, symbol) {
    // register the supported interface to conform to TradeTrustERC721 via ERC165
    _registerInterface(_INTERFACE_ID_TRADETRUST_ERC721);
  }

  function onERC721Received(
    address _operator,
    address _from,
    uint256 _tokenId,
    bytes memory _data
  ) public returns (bytes4) {
    emit TokenReceived(_operator, _from, _tokenId, _data);
    return this.onERC721Received.selector;
  }

  function destroyToken(uint256 _tokenId) public onlyMinter {
    require(ownerOf(_tokenId) == address(this), "Cannot destroy token: Token not owned by token registry");
    // Burning token to 0xdead instead to show a differentiate state as address(0) is used for unminted tokens
    _safeTransferFrom(ownerOf(_tokenId), 0x000000000000000000000000000000000000dEaD, _tokenId, "");
    emit TokenBurnt(_tokenId);
  }

  function sendToNewTitleEscrow(
    address beneficiary,
    address holder,
    uint256 _tokenId
  ) public onlyMinter {
    address newTitleEscrow = this.deployNewTitleEscrow(address(this), beneficiary, holder);
    _safeTransferFrom(address(this), newTitleEscrow, _tokenId, "");
  }

  function sendToken(address to, uint256 _tokenId) public onlyMinter {
    require(ownerOf(_tokenId) == address(this), "Cannot send token: Token not owned by token registry");
    _safeTransferFrom(ownerOf(_tokenId), to, _tokenId, "");
  }
}

contract CalculateTradeTrustERC721Selector {
  function calculateSelector() public pure returns (bytes4) {
    TradeTrustERC721 i;
    return
      i.onERC721Received.selector ^ i.destroyToken.selector ^ i.sendToNewTitleEscrow.selector ^ i.sendToken.selector;
  }
}
