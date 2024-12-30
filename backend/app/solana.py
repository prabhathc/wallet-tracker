from typing import List, Optional, Dict
from dataclasses import dataclass
import base58
import logging
import json
from solana.rpc.api import Client
from solana.rpc.commitment import Commitment
from solders.pubkey import Pubkey as PublicKey
from cachetools import TTLCache, cached

# Set up logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# Constants
TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
RPC_ENDPOINT = "https://api.devnet.solana.com"

# Cache for RPC responses (5 minutes TTL)
balance_cache = TTLCache(maxsize=100, ttl=300)

@dataclass
class TokenData:
    mint: str
    balance: float
    decimals: int

class SolanaClient:
    def __init__(self):
        logger.info("Initializing SolanaClient with endpoints: %s", RPC_ENDPOINT)
        self.clients = []
        connection_errors = []
        
        try:
            logger.debug("Attempting to connect to endpoint: %s", RPC_ENDPOINT)
            client = Client(RPC_ENDPOINT)
            
            # Test the connection with timeout
            health = client.get_health()
            if health.value != "ok":
                raise Exception(f"Unhealthy node response: {health.value}")
            
            self.clients.append(client)
            logger.info("Successfully connected to endpoint: %s", RPC_ENDPOINT)
            
        except Exception as e:
            error_msg = f"Failed to initialize client for endpoint {RPC_ENDPOINT}: {str(e)}"
            logger.warning(error_msg)
            connection_errors.append(error_msg)
        
        if not self.clients:
            error_details = "\n".join(connection_errors)
            logger.critical("All RPC endpoints failed!\n%s", error_details)
            raise RuntimeError("Failed to initialize any Solana RPC clients. Please check your internet connection or try again later.")
        
        self.current_client_index = 0

    def _get_client(self) -> Client:
        """Get the current client, rotating through available endpoints."""
        client = self.clients[self.current_client_index]
        logger.debug("Using RPC endpoint: %s", client._provider.endpoint_uri)
        return client

    def _rotate_client(self):
        """Rotate to the next available client."""
        old_endpoint = self.clients[self.current_client_index]._provider.endpoint_uri
        self.current_client_index = (self.current_client_index + 1) % len(self.clients)
        new_endpoint = self.clients[self.current_client_index]._provider.endpoint_uri
        logger.info("Rotating RPC endpoint from %s to %s", old_endpoint, new_endpoint)

    async def retry_rpc(self, operation):
        """Retry an RPC operation with multiple endpoints."""
        last_error = None
        for attempt in range(len(self.clients)):
            try:
                client = self._get_client()
                logger.debug("Attempting RPC call with endpoint: %s (attempt %d)", 
                           client._provider.endpoint_uri, attempt + 1)
                result = await operation(client)
                logger.debug("RPC call successful with endpoint: %s", 
                           client._provider.endpoint_uri)
                return result
            except Exception as e:
                logger.error("RPC call failed with endpoint %s: %s", 
                           client._provider.endpoint_uri, str(e))
                last_error = e
                self._rotate_client()
        
        logger.critical("All RPC endpoints failed. Last error: %s", str(last_error))
        raise last_error

    @cached(cache=balance_cache)
    async def get_sol_balance(self, wallet_address: str) -> float:
        """Get SOL balance for a wallet address."""
        try:
            logger.info("Getting SOL balance for wallet: %s", wallet_address)
            pubkey = PublicKey.from_string(wallet_address)
            logger.debug("Successfully created PublicKey from address")
            
            async def get_balance(client):
                logger.debug("Sending getBalance request to RPC")
                response = client.get_balance(pubkey, commitment=Commitment("confirmed"))
                logger.debug("Received balance response: %s", json.dumps(response))
                
                if "result" not in response or "value" not in response["result"]:
                    logger.error("Invalid response format: %s", json.dumps(response))
                    raise ValueError("Invalid response from RPC")
                
                balance = float(response["result"]["value"]) / 1e9
                logger.info("Successfully retrieved SOL balance: %f", balance)
                return balance
            
            return await self.retry_rpc(get_balance)
        except Exception as e:
            logger.error("Failed to get SOL balance: %s", str(e), exc_info=True)
            raise ValueError(f"Failed to get SOL balance: {str(e)}")

    async def get_token_accounts(self, wallet_address: str) -> List[TokenData]:
        """Get all token accounts for a wallet address."""
        try:
            logger.info("Getting token accounts for wallet: %s", wallet_address)
            pubkey = PublicKey.from_string(wallet_address)
            logger.debug("Successfully created PublicKey from address")
            
            async def get_accounts(client):
                logger.debug("Sending getParsedTokenAccountsByOwner request to RPC")
                response = client.get_token_accounts_by_owner(
                    pubkey,
                    {"programId": TOKEN_PROGRAM_ID},
                    encoding="jsonParsed",
                    commitment=Commitment("confirmed")
                )
                logger.debug("Received token accounts response: %s", json.dumps(response))
                
                if "result" not in response or "value" not in response["result"]:
                    logger.error("Invalid response format: %s", json.dumps(response))
                    raise ValueError("Invalid response from RPC")
                
                tokens: List[TokenData] = []
                for account in response["result"]["value"]:
                    try:
                        parsed = account["account"]["data"]["parsed"]["info"]
                        mint = parsed["mint"]
                        decimals = parsed["tokenAmount"]["decimals"]
                        amount = float(parsed["tokenAmount"]["amount"]) / (10 ** decimals)
                        
                        if amount > 0:  # Only include non-zero balances
                            tokens.append(TokenData(
                                mint=mint,
                                balance=amount,
                                decimals=decimals
                            ))
                            logger.debug("Found token: mint=%s, balance=%f", mint, amount)
                    except (KeyError, ValueError) as e:
                        logger.error("Error parsing token account: %s", str(e))
                        continue
                
                logger.info("Successfully retrieved %d token accounts", len(tokens))
                return tokens
            
            return await self.retry_rpc(get_accounts)
        except Exception as e:
            logger.error("Failed to get token accounts: %s", str(e), exc_info=True)
            raise ValueError(f"Failed to get token accounts: {str(e)}")

    @staticmethod
    def is_valid_address(address: str) -> bool:
        """Validate a Solana address."""
        try:
            logger.debug("Validating address: %s", address)
            decoded = base58.b58decode(address)
            valid = len(decoded) == 32
            logger.debug("Address validation result: %s", valid)
            return valid
        except Exception as e:
            logger.error("Address validation failed: %s", str(e))
            return False
