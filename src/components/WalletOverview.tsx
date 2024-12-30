import { Card, Title, AreaChart, Text, Metric, Flex, Badge } from '@tremor/react';

interface WalletOverviewProps {
  className?: string;
  solBalance: number;
}

const dummyData = [
  { date: '2024-01', value: 2400 },
  { date: '2024-02', value: 2800 },
  { date: '2024-03', value: 3200 },
];

export default function WalletOverview({ className, solBalance }: WalletOverviewProps) {
  // Using a fixed price for demonstration
  const solPrice = 100;
  const totalValueUSD = solBalance * solPrice;

  return (
    <Card className={className}>
      <div className="space-y-8">
        <div>
          <Title>Wallet Overview</Title>
          <Flex className="mt-4">
            <div>
              <Text>Total Balance (USD)</Text>
              <Metric>${totalValueUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Metric>
            </div>
            <Badge size="xl" color="blue">
              SOL Price: ${solPrice}
            </Badge>
          </Flex>
        </div>

        <div>
          <Text>SOL Balance</Text>
          <Flex className="mt-2">
            <Text className="text-tremor-default font-medium">
              {solBalance.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 9 })} SOL
            </Text>
          </Flex>
        </div>
        
        <div>
          <Title className="mb-2">Balance History</Title>
          <Text className="text-tremor-default text-tremor-content">Last 3 months</Text>
          <AreaChart
            className="mt-4 h-72"
            data={dummyData}
            index="date"
            categories={["value"]}
            colors={["blue"]}
            valueFormatter={(number) => `$${number.toLocaleString()}`}
            showAnimation={true}
            showLegend={false}
          />
        </div>
      </div>
    </Card>
  );
} 