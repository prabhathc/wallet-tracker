import { ArrowDownRight, ArrowUpRight, RefreshCw, Coins, CircleDollarSign, CircleDot } from 'lucide-react';
import { Transaction } from '@/types/transaction';

const getTransactionIcon = (tx: Transaction) => {
  if (tx.direction === 'in') {
    return <ArrowDownRight className="text-green-500" />;
  }
  if (tx.direction === 'out') {
    return <ArrowUpRight className="text-red-500" />;
  }
  if (tx.type === 'SWAP') {
    return <RefreshCw className="text-blue-500" />;
  }
  if (tx.type === 'TOKEN_TRANSFER') {
    return <Coins className="text-yellow-500" />;
  }
  if (tx.type === 'SOL_TRANSFER') {
    return <CircleDollarSign className="text-purple-500" />;
  }
  // Default icon for unknown types
  return <CircleDot className="text-gray-500" />;
}; 