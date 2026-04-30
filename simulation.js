export function runMonteCarloSimulation({
  rooms = 50,
  days = 30,
  iterations = 1000,

  occupancyMean = 0.45,
  occupancyStd = 0.05,

  adrMean = 100,
  adrStd = 10,

  attachRateMean = 0.25,
  attachRateStd = 0.05,

  spendMean = 25,
  spendStd = 5,
}) {
  function randomNormal(mean, std) {
    const u = 1 - Math.random();
    const v = Math.random();
    const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    return mean + z * std;
  }

  const results = [];

  for (let i = 0; i < iterations; i++) {
    let totalRevenue = 0;

    for (let d = 0; d < days; d++) {
      const occupancy = Math.max(0, Math.min(1, randomNormal(occupancyMean, occupancyStd)));
      const adr = randomNormal(adrMean, adrStd);

      const roomsSold = rooms * occupancy;
      const roomRevenue = roomsSold * adr;

      const attachRate = Math.max(0, Math.min(1, randomNormal(attachRateMean, attachRateStd)));
      const spend = randomNormal(spendMean, spendStd);

      const ancillaryRevenue = roomsSold * attachRate * spend;

      totalRevenue += roomRevenue + ancillaryRevenue;
    }

    results.push(totalRevenue);
  }

  return results;
}