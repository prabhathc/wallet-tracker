import {
  Card,
  Title,
  List,
  ListItem,
  Text,
  Badge,
  Flex,
} from '@tremor/react';
import { TokenBalance } from '../utils/solana';

interface TokenListProps {
  className?: string;
  tokens: TokenBalance[];
}

export default function TokenList({ className, tokens }: TokenListProps) {
  return (
    <Card className={className}>
      <div className="space-y-4">
        <Flex>
          <Title>Token Holdings</Title>
          <Badge size="xl">{tokens.length} Tokens</Badge>
        </Flex>
        
        {tokens.length === 0 ? (
          <Text className="text-center py-4">No tokens found in this wallet</Text>
        ) : (
          <List className="mt-4">
            {tokens.map((token) => (
              <ListItem key={token.mint} className="hover:bg-gray-50">
                <div className="flex justify-between items-center w-full">
                  <div>
                    <Text className="font-medium">{token.mint.slice(0, 8)}...</Text>
                    <Badge color="blue" className="mt-1">
                      SPL Token
                    </Badge>
                  </div>
                  <div className="text-right">
                    <Text className="font-medium">
                      {token.amount.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: token.decimals
                      })}
                    </Text>
                    {token.value_usd !== undefined && token.value_usd > 0 && (
                      <Text className="text-gray-500 text-sm">
                        ${token.value_usd.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        })}
                      </Text>
                    )}
                  </div>
                </div>
              </ListItem>
            ))}
          </List>
        )}
      </div>
    </Card>
  );
} 