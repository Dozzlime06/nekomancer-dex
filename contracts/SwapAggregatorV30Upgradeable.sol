// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IUniswapV2Router {
    function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory);
    function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory);
    function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory);
    function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory);
}

interface ISwapRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }
    struct ExactInputParams {
        bytes path;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
    }
    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
    function exactInput(ExactInputParams calldata params) external payable returns (uint256 amountOut);
    function unwrapWETH9(uint256 amountMinimum, address recipient) external payable;
    function multicall(uint256 deadline, bytes[] calldata data) external payable returns (bytes[] memory results);
}

interface IWMON {
    function deposit() external payable;
    function withdraw(uint256) external;
}

interface INadFunLens {
    function getAmountOut(address _token, uint256 _amountIn, bool _isBuy) external view returns (address router, uint256 amountOut);
    function isGraduated(address _token) external view returns (bool);
}

struct NadFunBuyParams {
    uint256 amountOutMin;
    address token;
    address to;
    uint256 deadline;
}

struct NadFunSellParams {
    uint256 amountIn;
    uint256 amountOutMin;
    address token;
    address to;
    uint256 deadline;
}

interface INadFunBondingRouter {
    function buy(NadFunBuyParams calldata params) external payable;
    function sell(NadFunSellParams calldata params) external;
    function buyWithReferrer(NadFunBuyParams calldata params, address referrer) external payable;
    function sellWithReferrer(NadFunSellParams calldata params, address referrer) external;
}

interface INadFunDexRouter {
    function buy(NadFunBuyParams calldata params) external payable returns (uint256 amountOut);
    function sell(NadFunSellParams calldata params) external returns (uint256 amountOut);
}

interface IV3Factory {
    function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool);
}

interface IV3Pool {
    function liquidity() external view returns (uint128);
}

/// @notice Fee recipient with basis points
struct FeeRecipient {
    address recipient;
    uint256 bps;  // Basis points (100 = 1%)
}

/// @notice Route hop for multi-hop swaps
struct SwapHop {
    address tokenOut;
    uint24 fee;      // V3 fee tier (500, 3000, 10000)
    uint8 dexType;   // 0=V2, 1=V3
}

/// @title SwapAggregatorV30 - Multi-hop & Multi-recipient Fee Aggregator
/// @notice Supports token-to-token swaps through WMON and flexible fee distribution
/// @dev V30: Multi-hop routing + multi-recipient fees like competitor
contract SwapAggregatorV30Upgradeable is 
    Initializable, 
    OwnableUpgradeable, 
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable 
{
    using SafeERC20 for IERC20;

    address public constant WMON = 0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A;
    address public constant UNISWAP_V2 = 0x4B2ab38DBF28D31D467aA8993f6c2585981D6804;
    address public constant PANCAKE_V2 = 0xB1Bc24c34e88f7D43D5923034E3a14B24DaACfF9;
    address public constant UNISWAP_V3 = 0xfE31F71C1b106EAc32F1A19239c9a9A72ddfb900;
    address public constant V3_FACTORY = 0x961235a9020B05C44DF1026D956D1F4D78014276;
    address public constant NADFUN_LENS = 0x7e78A8DE94f21804F7a17F4E8BF9EC2c872187ea;
    address public constant NADFUN_BONDING_ROUTER = 0x6F6B8F1a20703309951a5127c45B49b1CD981A22;
    address public constant NADFUN_DEX_ROUTER = 0x0B79d71AE99528D1dB24A4148b5f4F865cc2b137;
    
    address public platformRecipient;
    address public stakingRecipient;
    uint256 public feeBps;

    event SwapExecuted(address indexed user, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut, uint256 fee, string dex);
    event MultiHopSwap(address indexed user, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut, address intermediate);
    event FeesDistributed(address[] recipients, uint256[] amounts);
    event ReferrerFeeReceived(address indexed from, uint256 amount);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _platform, address _staking) public initializer {
        __Ownable_init(msg.sender);
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();
        
        platformRecipient = _platform;
        stakingRecipient = _staking;
        feeBps = 100; // 1%
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    function setFee(uint256 _bps) external onlyOwner {
        require(_bps <= 500, "Max 5%");
        feeBps = _bps;
    }

    function setRecipients(address _p, address _s) external onlyOwner {
        platformRecipient = _p;
        stakingRecipient = _s;
    }

    // ============ MULTI-RECIPIENT FEE DISTRIBUTION ============
    
    /// @notice Distribute fees to multiple recipients
    /// @param amount Total fee amount to distribute
    /// @param recipients Array of fee recipients with bps
    function _distributeFeesToRecipients(uint256 amount, FeeRecipient[] memory recipients) internal {
        if (amount == 0 || recipients.length == 0) return;
        
        uint256 totalBps;
        for (uint i = 0; i < recipients.length; i++) {
            totalBps += recipients[i].bps;
        }
        require(totalBps <= 10000, "Total bps > 100%");
        
        address[] memory addrs = new address[](recipients.length);
        uint256[] memory amounts = new uint256[](recipients.length);
        
        for (uint i = 0; i < recipients.length; i++) {
            uint256 share = (amount * recipients[i].bps) / totalBps;
            addrs[i] = recipients[i].recipient;
            amounts[i] = share;
            
            if (share > 0) {
                (bool success,) = recipients[i].recipient.call{value: share}("");
                require(success, "Fee transfer failed");
            }
        }
        
        emit FeesDistributed(addrs, amounts);
    }
    
    /// @notice Default 50/50 fee distribution
    function _distributeFees(uint256 total) internal {
        if (total == 0) return;
        uint256 half = total / 2;
        (bool s1,) = platformRecipient.call{value: half}("");
        (bool s2,) = stakingRecipient.call{value: total - half}("");
        require(s1 && s2, "Fee failed");
        
        address[] memory addrs = new address[](2);
        uint256[] memory amounts = new uint256[](2);
        addrs[0] = platformRecipient;
        addrs[1] = stakingRecipient;
        amounts[0] = half;
        amounts[1] = total - half;
        emit FeesDistributed(addrs, amounts);
    }

    // ============ MULTI-HOP SWAPS (Token A → WMON → Token B) ============
    
    /// @notice Swap any token for any other token via WMON
    /// @param tokenIn Input token address
    /// @param tokenOut Output token address  
    /// @param amountIn Amount of tokenIn to swap
    /// @param minOut Minimum output amount
    /// @param deadline Transaction deadline
    /// @param feeIn V3 fee for tokenIn→WMON (0 for V2)
    /// @param feeOut V3 fee for WMON→tokenOut (0 for V2)
    function swapTokensForTokens(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minOut,
        uint256 deadline,
        uint24 feeIn,
        uint24 feeOut
    ) external nonReentrant returns (uint256) {
        require(amountIn > 0, "No tokens");
        require(tokenIn != tokenOut, "Same token");
        
        // Transfer tokens from user
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        
        // Step 1: Swap tokenIn → WMON
        uint256 wmonAmount = _swapToWMON(tokenIn, amountIn, deadline, feeIn);
        
        // Take fee from WMON amount
        uint256 fee = (wmonAmount * feeBps) / 10000;
        uint256 netWmon = wmonAmount - fee;
        
        // Step 2: Swap WMON → tokenOut
        uint256 amountOut = _swapFromWMON(tokenOut, netWmon, minOut, deadline, feeOut);
        
        // Distribute fees (unwrap WMON first)
        if (fee > 0) {
            IWMON(WMON).withdraw(fee);
            _distributeFees(fee);
        }
        
        emit MultiHopSwap(msg.sender, tokenIn, tokenOut, amountIn, amountOut, WMON);
        return amountOut;
    }
    
    /// @notice Swap tokens with custom fee recipients
    /// @param tokenIn Input token address
    /// @param tokenOut Output token address
    /// @param amountIn Amount to swap
    /// @param minOut Minimum output
    /// @param deadline Transaction deadline
    /// @param feeIn V3 fee tier for first hop
    /// @param feeOut V3 fee tier for second hop
    /// @param feeRecipients Array of fee recipients with bps splits
    function swapTokensWithFees(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minOut,
        uint256 deadline,
        uint24 feeIn,
        uint24 feeOut,
        FeeRecipient[] calldata feeRecipients
    ) external nonReentrant returns (uint256) {
        require(amountIn > 0, "No tokens");
        require(tokenIn != tokenOut, "Same token");
        require(feeRecipients.length > 0 && feeRecipients.length <= 5, "Invalid recipients");
        
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        
        uint256 wmonAmount = _swapToWMON(tokenIn, amountIn, deadline, feeIn);
        
        uint256 fee = (wmonAmount * feeBps) / 10000;
        uint256 netWmon = wmonAmount - fee;
        
        uint256 amountOut = _swapFromWMON(tokenOut, netWmon, minOut, deadline, feeOut);
        
        if (fee > 0) {
            IWMON(WMON).withdraw(fee);
            _distributeFeesToRecipients(fee, feeRecipients);
        }
        
        emit MultiHopSwap(msg.sender, tokenIn, tokenOut, amountIn, amountOut, WMON);
        return amountOut;
    }
    
    /// @notice Internal: Swap token to WMON
    function _swapToWMON(address tokenIn, uint256 amountIn, uint256 deadline, uint24 v3Fee) internal returns (uint256) {
        if (v3Fee > 0) {
            // V3 swap
            IERC20(tokenIn).forceApprove(UNISWAP_V3, amountIn);
            
            bytes[] memory calls = new bytes[](1);
            calls[0] = abi.encodeWithSelector(
                ISwapRouter.exactInputSingle.selector,
                ISwapRouter.ExactInputSingleParams({
                    tokenIn: tokenIn,
                    tokenOut: WMON,
                    fee: v3Fee,
                    recipient: address(this),
                    amountIn: amountIn,
                    amountOutMinimum: 0,
                    sqrtPriceLimitX96: 0
                })
            );
            
            bytes[] memory results = ISwapRouter(UNISWAP_V3).multicall(deadline, calls);
            return abi.decode(results[0], (uint256));
        } else {
            // V2 swap
            (address router,) = _getBestRouter(tokenIn, WMON, amountIn);
            IERC20(tokenIn).forceApprove(router, amountIn);
            
            address[] memory path = new address[](2);
            path[0] = tokenIn;
            path[1] = WMON;
            
            uint[] memory amounts = IUniswapV2Router(router).swapExactTokensForTokens(
                amountIn, 0, path, address(this), deadline
            );
            return amounts[1];
        }
    }
    
    /// @notice Internal: Swap WMON to token
    function _swapFromWMON(address tokenOut, uint256 wmonAmount, uint256 minOut, uint256 deadline, uint24 v3Fee) internal returns (uint256) {
        if (v3Fee > 0) {
            // V3 swap
            IERC20(WMON).forceApprove(UNISWAP_V3, wmonAmount);
            
            bytes[] memory calls = new bytes[](1);
            calls[0] = abi.encodeWithSelector(
                ISwapRouter.exactInputSingle.selector,
                ISwapRouter.ExactInputSingleParams({
                    tokenIn: WMON,
                    tokenOut: tokenOut,
                    fee: v3Fee,
                    recipient: msg.sender,
                    amountIn: wmonAmount,
                    amountOutMinimum: minOut,
                    sqrtPriceLimitX96: 0
                })
            );
            
            bytes[] memory results = ISwapRouter(UNISWAP_V3).multicall(deadline, calls);
            return abi.decode(results[0], (uint256));
        } else {
            // V2 swap
            (address router,) = _getBestRouter(WMON, tokenOut, wmonAmount);
            IERC20(WMON).forceApprove(router, wmonAmount);
            
            address[] memory path = new address[](2);
            path[0] = WMON;
            path[1] = tokenOut;
            
            uint[] memory amounts = IUniswapV2Router(router).swapExactTokensForTokens(
                wmonAmount, minOut, path, msg.sender, deadline
            );
            return amounts[1];
        }
    }

    // ============ MON → TOKEN SWAPS ============
    
    /// @notice Swap MON for tokens with custom fee recipients
    function swapMONForTokensWithFees(
        address tokenOut,
        uint256 minOut,
        uint256 deadline,
        uint24 v3Fee,
        FeeRecipient[] calldata feeRecipients
    ) external payable nonReentrant returns (uint256) {
        require(msg.value > 0, "No MON");
        require(feeRecipients.length > 0 && feeRecipients.length <= 5, "Invalid recipients");
        
        uint256 fee = (msg.value * feeBps) / 10000;
        uint256 amountIn = msg.value - fee;
        
        _distributeFeesToRecipients(fee, feeRecipients);
        
        if (v3Fee > 0) {
            return _swapMONForTokensV3(tokenOut, amountIn, minOut, deadline, v3Fee);
        } else {
            return _swapMONForTokensV2(tokenOut, amountIn, minOut, deadline);
        }
    }
    
    /// @notice Standard MON → Token swap with default 50/50 fees
    function swapMONForTokens(
        address tokenOut,
        uint256 minOut,
        uint256 deadline,
        bool useV3,
        uint24 v3Fee
    ) external payable nonReentrant returns (uint256) {
        require(msg.value > 0, "No MON");
        
        uint256 fee = (msg.value * feeBps) / 10000;
        uint256 amountIn = msg.value - fee;
        _distributeFees(fee);
        
        if (useV3) {
            return _swapMONForTokensV3(tokenOut, amountIn, minOut, deadline, v3Fee);
        } else {
            return _swapMONForTokensV2(tokenOut, amountIn, minOut, deadline);
        }
    }
    
    function _swapMONForTokensV3(address tokenOut, uint256 amountIn, uint256 minOut, uint256 deadline, uint24 v3Fee) internal returns (uint256) {
        IWMON(WMON).deposit{value: amountIn}();
        IERC20(WMON).forceApprove(UNISWAP_V3, amountIn);
        
        bytes[] memory calls = new bytes[](1);
        calls[0] = abi.encodeWithSelector(
            ISwapRouter.exactInputSingle.selector,
            ISwapRouter.ExactInputSingleParams({
                tokenIn: WMON,
                tokenOut: tokenOut,
                fee: v3Fee,
                recipient: msg.sender,
                amountIn: amountIn,
                amountOutMinimum: minOut,
                sqrtPriceLimitX96: 0
            })
        );
        
        bytes[] memory results = ISwapRouter(UNISWAP_V3).multicall(deadline, calls);
        uint256 amountOut = abi.decode(results[0], (uint256));
        
        emit SwapExecuted(msg.sender, WMON, tokenOut, amountIn, amountOut, 0, "uniswap_v3");
        return amountOut;
    }
    
    function _swapMONForTokensV2(address tokenOut, uint256 amountIn, uint256 minOut, uint256 deadline) internal returns (uint256) {
        (address router, string memory dex) = _getBestRouter(WMON, tokenOut, amountIn);
        
        address[] memory path = new address[](2);
        path[0] = WMON;
        path[1] = tokenOut;
        
        uint[] memory amounts = IUniswapV2Router(router).swapExactETHForTokens{value: amountIn}(minOut, path, msg.sender, deadline);
        uint256 amountOut = amounts[1];
        
        emit SwapExecuted(msg.sender, WMON, tokenOut, amountIn, amountOut, 0, dex);
        return amountOut;
    }

    // ============ TOKEN → MON SWAPS ============
    
    /// @notice Swap tokens for MON with custom fee recipients
    function swapTokensForMONWithFees(
        address tokenIn,
        uint256 amountIn,
        uint256 minOut,
        uint256 deadline,
        uint24 v3Fee,
        FeeRecipient[] calldata feeRecipients
    ) external nonReentrant returns (uint256) {
        require(amountIn > 0, "No tokens");
        require(feeRecipients.length > 0 && feeRecipients.length <= 5, "Invalid recipients");
        
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        
        uint256 rawOut;
        if (v3Fee > 0) {
            rawOut = _swapTokensForMONV3(tokenIn, amountIn, deadline, v3Fee);
        } else {
            rawOut = _swapTokensForMONV2(tokenIn, amountIn, deadline);
        }
        
        uint256 fee = (rawOut * feeBps) / 10000;
        uint256 amountOut = rawOut - fee;
        require(amountOut >= minOut, "Slippage");
        
        _distributeFeesToRecipients(fee, feeRecipients);
        
        (bool success,) = msg.sender.call{value: amountOut}("");
        require(success, "Transfer failed");
        
        emit SwapExecuted(msg.sender, tokenIn, WMON, amountIn, amountOut, fee, v3Fee > 0 ? "uniswap_v3" : "v2");
        return amountOut;
    }
    
    /// @notice Standard Token → MON swap with default fees
    function swapTokensForMON(
        address tokenIn,
        uint256 amountIn,
        uint256 minOut,
        uint256 deadline,
        bool useV3,
        uint24 v3Fee
    ) external nonReentrant returns (uint256) {
        require(amountIn > 0, "No tokens");
        
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        
        uint256 rawOut;
        if (useV3) {
            rawOut = _swapTokensForMONV3(tokenIn, amountIn, deadline, v3Fee);
        } else {
            rawOut = _swapTokensForMONV2(tokenIn, amountIn, deadline);
        }
        
        uint256 fee = (rawOut * feeBps) / 10000;
        uint256 amountOut = rawOut - fee;
        require(amountOut >= minOut, "Slippage");
        
        _distributeFees(fee);
        
        (bool success,) = msg.sender.call{value: amountOut}("");
        require(success, "Transfer failed");
        
        emit SwapExecuted(msg.sender, tokenIn, WMON, amountIn, amountOut, fee, useV3 ? "uniswap_v3" : "v2");
        return amountOut;
    }
    
    function _swapTokensForMONV3(address tokenIn, uint256 amountIn, uint256 deadline, uint24 v3Fee) internal returns (uint256) {
        IERC20(tokenIn).forceApprove(UNISWAP_V3, amountIn);
        
        uint256 balanceBefore = address(this).balance;
        
        bytes[] memory calls = new bytes[](2);
        calls[0] = abi.encodeWithSelector(
            ISwapRouter.exactInputSingle.selector,
            ISwapRouter.ExactInputSingleParams({
                tokenIn: tokenIn,
                tokenOut: WMON,
                fee: v3Fee,
                recipient: address(2),
                amountIn: amountIn,
                amountOutMinimum: 0,
                sqrtPriceLimitX96: 0
            })
        );
        calls[1] = abi.encodeWithSelector(
            ISwapRouter.unwrapWETH9.selector,
            uint256(0),
            address(this)
        );
        
        ISwapRouter(UNISWAP_V3).multicall(deadline, calls);
        return address(this).balance - balanceBefore;
    }
    
    function _swapTokensForMONV2(address tokenIn, uint256 amountIn, uint256 deadline) internal returns (uint256) {
        (address router,) = _getBestRouter(tokenIn, WMON, amountIn);
        IERC20(tokenIn).forceApprove(router, amountIn);
        
        address[] memory path = new address[](2);
        path[0] = tokenIn;
        path[1] = WMON;
        
        uint256 balBefore = address(this).balance;
        IUniswapV2Router(router).swapExactTokensForETH(amountIn, 0, path, address(this), deadline);
        return address(this).balance - balBefore;
    }

    // ============ NAD.FUN SWAPS ============
    
    /// @notice Buy Nad.Fun token with MON (uses referrer for unbonded)
    function nadFunBuy(
        address token,
        uint256 minOut,
        uint256 deadline,
        uint24 v3Fee
    ) external payable nonReentrant returns (uint256) {
        require(msg.value > 0, "No MON");
        
        uint256 fee = (msg.value * feeBps) / 10000;
        uint256 amountIn = msg.value - fee;
        _distributeFees(fee);
        
        bool graduated = INadFunLens(NADFUN_LENS).isGraduated(token);
        
        uint256 amountOut;
        if (graduated && v3Fee > 0) {
            amountOut = _swapMONForTokensV3(token, amountIn, minOut, deadline, v3Fee);
        } else if (graduated) {
            // DEX Router for graduated tokens
            NadFunBuyParams memory params = NadFunBuyParams({
                amountOutMin: minOut,
                token: token,
                to: msg.sender,
                deadline: deadline
            });
            uint256 balBefore = IERC20(token).balanceOf(msg.sender);
            INadFunDexRouter(NADFUN_DEX_ROUTER).buy{value: amountIn}(params);
            amountOut = IERC20(token).balanceOf(msg.sender) - balBefore;
        } else {
            // Bonding Router for unbonded tokens
            NadFunBuyParams memory params = NadFunBuyParams({
                amountOutMin: minOut,
                token: token,
                to: msg.sender,
                deadline: deadline
            });
            uint256 balBefore = IERC20(token).balanceOf(msg.sender);
            INadFunBondingRouter(NADFUN_BONDING_ROUTER).buy{value: amountIn}(params);
            amountOut = IERC20(token).balanceOf(msg.sender) - balBefore;
        }
        
        emit SwapExecuted(msg.sender, address(0), token, amountIn, amountOut, fee, "nadfun");
        return amountOut;
    }
    
    /// @notice Sell Nad.Fun token for MON
    function nadFunSell(
        address token,
        uint256 amountIn,
        uint256 minOut,
        uint256 deadline,
        uint24 v3Fee
    ) external nonReentrant returns (uint256) {
        require(amountIn > 0, "No tokens");
        
        IERC20(token).safeTransferFrom(msg.sender, address(this), amountIn);
        
        bool graduated = INadFunLens(NADFUN_LENS).isGraduated(token);
        
        uint256 rawOut;
        if (graduated) {
            if (v3Fee > 0) {
                // V3 pool
                rawOut = _swapTokensForMONV3(token, amountIn, deadline, v3Fee);
            } else {
                // DEX Router - returns native MON directly (not WMON)
                IERC20(token).forceApprove(NADFUN_DEX_ROUTER, amountIn);
                
                NadFunSellParams memory params = NadFunSellParams({
                    amountIn: amountIn,
                    amountOutMin: 1,
                    token: token,
                    to: address(this),
                    deadline: deadline
                });
                
                // Track native MON balance (DEX Router sends MON, not WMON)
                uint256 balBefore = address(this).balance;
                INadFunDexRouter(NADFUN_DEX_ROUTER).sell(params);
                rawOut = address(this).balance - balBefore;
            }
        } else {
            // Bonding Router for unbonded
            IERC20(token).forceApprove(NADFUN_BONDING_ROUTER, amountIn);
            
            NadFunSellParams memory params = NadFunSellParams({
                amountIn: amountIn,
                amountOutMin: 0,
                token: token,
                to: address(this),
                deadline: deadline
            });
            
            uint256 balBefore = address(this).balance;
            INadFunBondingRouter(NADFUN_BONDING_ROUTER).sell(params);
            rawOut = address(this).balance - balBefore;
        }
        
        uint256 fee = (rawOut * feeBps) / 10000;
        uint256 amountOut = rawOut - fee;
        require(amountOut >= minOut, "Slippage");
        
        _distributeFees(fee);
        
        (bool success,) = msg.sender.call{value: amountOut}("");
        require(success, "Transfer failed");
        
        emit SwapExecuted(msg.sender, token, address(0), amountIn, amountOut, fee, "nadfun");
        return amountOut;
    }
    
    /// @notice Sell Nad.Fun token with custom fee recipients
    function nadFunSellWithFees(
        address token,
        uint256 amountIn,
        uint256 minOut,
        uint256 deadline,
        uint24 v3Fee,
        FeeRecipient[] calldata feeRecipients
    ) external nonReentrant returns (uint256) {
        require(amountIn > 0, "No tokens");
        require(feeRecipients.length > 0 && feeRecipients.length <= 5, "Invalid recipients");
        
        IERC20(token).safeTransferFrom(msg.sender, address(this), amountIn);
        
        bool graduated = INadFunLens(NADFUN_LENS).isGraduated(token);
        
        uint256 rawOut;
        if (graduated) {
            if (v3Fee > 0) {
                rawOut = _swapTokensForMONV3(token, amountIn, deadline, v3Fee);
            } else {
                // DEX Router - returns native MON directly (not WMON)
                IERC20(token).forceApprove(NADFUN_DEX_ROUTER, amountIn);
                
                NadFunSellParams memory params = NadFunSellParams({
                    amountIn: amountIn,
                    amountOutMin: 1,
                    token: token,
                    to: address(this),
                    deadline: deadline
                });
                
                // Track native MON balance (DEX Router sends MON, not WMON)
                uint256 balBefore = address(this).balance;
                INadFunDexRouter(NADFUN_DEX_ROUTER).sell(params);
                rawOut = address(this).balance - balBefore;
            }
        } else {
            IERC20(token).forceApprove(NADFUN_BONDING_ROUTER, amountIn);
            
            NadFunSellParams memory params = NadFunSellParams({
                amountIn: amountIn,
                amountOutMin: 0,
                token: token,
                to: address(this),
                deadline: deadline
            });
            
            uint256 balBefore = address(this).balance;
            INadFunBondingRouter(NADFUN_BONDING_ROUTER).sell(params);
            rawOut = address(this).balance - balBefore;
        }
        
        uint256 fee = (rawOut * feeBps) / 10000;
        uint256 amountOut = rawOut - fee;
        require(amountOut >= minOut, "Slippage");
        
        _distributeFeesToRecipients(fee, feeRecipients);
        
        (bool success,) = msg.sender.call{value: amountOut}("");
        require(success, "Transfer failed");
        
        emit SwapExecuted(msg.sender, token, address(0), amountIn, amountOut, fee, "nadfun");
        return amountOut;
    }

    // ============ HELPER FUNCTIONS ============
    
    function _getBestRouter(address tokenIn, address tokenOut, uint256 amountIn) internal view returns (address router, string memory dex) {
        address[] memory path = new address[](2);
        path[0] = tokenIn;
        path[1] = tokenOut;
        
        uint256 uniOut;
        uint256 pcsOut;
        
        try IUniswapV2Router(UNISWAP_V2).getAmountsOut(amountIn, path) returns (uint[] memory amounts) {
            uniOut = amounts[1];
        } catch {}
        
        try IUniswapV2Router(PANCAKE_V2).getAmountsOut(amountIn, path) returns (uint[] memory amounts) {
            pcsOut = amounts[1];
        } catch {}
        
        if (uniOut >= pcsOut && uniOut > 0) {
            return (UNISWAP_V2, "uniswap_v2");
        } else if (pcsOut > 0) {
            return (PANCAKE_V2, "pancakeswap_v2");
        }
        
        revert("No V2 liquidity");
    }
    
    function _getPoolForFee(address token, uint24 fee) internal view returns (address) {
        return IV3Factory(V3_FACTORY).getPool(token, WMON, fee);
    }
    
    /// @notice Distribute accumulated referrer fees
    function distributeReferrerFees() external nonReentrant returns (uint256 distributed) {
        distributed = address(this).balance;
        if (distributed > 0) {
            _distributeFees(distributed);
        }
    }
    
    function pendingReferrerFees() external view returns (uint256) {
        return address(this).balance;
    }

    // ============ ADMIN FUNCTIONS ============
    
    function recoverTokens(address t, address to) external onlyOwner {
        IERC20(t).safeTransfer(to, IERC20(t).balanceOf(address(this)));
    }
    
    function recoverMON(address to) external onlyOwner {
        (bool s,) = to.call{value: address(this).balance}("");
        require(s);
    }
    
    function getVersion() external pure returns (string memory) { return "30.0.0"; }
    
    receive() external payable {
        emit ReferrerFeeReceived(msg.sender, msg.value);
    }
}
