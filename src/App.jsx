import React, { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

/* ================= RANDOM ================= */
function randomNormal(mean, std) {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return mean + std * Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

/* ================= SIMULATION ================= */
function simulate(params, iterations = 2000) {
  const results = [];

  for (let i = 0; i < iterations; i++) {
    const occ = Math.max(0, Math.min(1, randomNormal(params.occMean, params.occStd)));
    const adr = randomNormal(params.adrMean, params.adrStd);

    const roomsSold = params.rooms * occ;

    const roomRevenue = roomsSold * adr;

    const attach = Math.max(0, Math.min(1, randomNormal(params.attachRate, 0.05)));
    const ancillary = roomsSold * attach * randomNormal(params.spend, 8);

    const total = (roomRevenue + ancillary) * (1 - params.cancelRate);

    results.push(total);
  }

  results.sort((a, b) => a - b);

  return {
    avg: results[Math.floor(results.length * 0.5)],
    p10: results[Math.floor(results.length * 0.1)],
    p90: results[Math.floor(results.length * 0.9)],
  };
}

/* ================= BASELINE ================= */
const baseScenario = {
  Weekday: {
    rooms: 50,
    occMean: 0.45,
    occStd: 0.08,
    adrMean: 95,
    adrStd: 12,
    attachRate: 0.78,
    spend: 80,
    cancelRate: 0.12,
  },
  Weekend: {
    rooms: 50,
    occMean: 0.38,
    occStd: 0.07,
    adrMean: 110,
    adrStd: 10,
    attachRate: 0.75,
    spend: 70,
    cancelRate: 0.18,
  },
};

/* ================= STRATEGIES ================= */
const strategies = {
  None: (p) => p,

  ImprovePricing: (p) => ({
    ...p,
    adrMean: p.adrMean * 1.08,
  }),

  ReduceOTA: (p) => ({
    ...p,
    cancelRate: p.cancelRate * 0.7,
  }),

  UpsellAncillary: (p) => ({
    ...p,
    attachRate: Math.min(1, p.attachRate + 0.1),
    spend: p.spend * 1.15,
  }),

  FullOptimization: (p) => ({
    ...p,
    adrMean: p.adrMean * 1.08,
    cancelRate: p.cancelRate * 0.7,
    attachRate: Math.min(1, p.attachRate + 0.1),
    spend: p.spend * 1.15,
  }),
};

/* ================= APP ================= */
export default function App() {
  const [dayType, setDayType] = useState("Weekday");
  const [strategy, setStrategy] = useState("None");

  const base = baseScenario[dayType];
  const modified = strategies[strategy](base);

  const baselineResult = useMemo(() => simulate(base), [dayType]);
  const strategyResult = useMemo(() => simulate(modified), [dayType, strategy]);

  const uplift = ((strategyResult.avg - baselineResult.avg) / baselineResult.avg) * 100;

  const chartData = [
    {
      name: "Baseline",
      value: baselineResult.avg,
    },
    {
      name: "Strategy",
      value: strategyResult.avg,
    },
  ];

  return (
    <div className="container">
      <h1 className="title">Hotel Revenue Strategy Simulator</h1>

      {/* DAY TYPE */}
      <div className="button-row" style={{ marginTop: 20 }}>
        <button
          className={`btn ${dayType === "Weekday" ? "active" : ""}`}
          onClick={() => setDayType("Weekday")}
        >
          Weekday
        </button>
        <button
          className={`btn ${dayType === "Weekend" ? "active" : ""}`}
          onClick={() => setDayType("Weekend")}
        >
          Weekend
        </button>
      </div>

      {/* STRATEGY */}
      <div className="button-row" style={{ marginTop: 20 }}>
        {Object.keys(strategies).map((s) => (
          <button
            key={s}
            className={`btn ${strategy === s ? "active" : ""}`}
            onClick={() => setStrategy(s)}
          >
            {s}
          </button>
        ))}
      </div>

      {/* KPI */}
      <div className="grid-3" style={{ marginTop: 30 }}>
        <div className="card">
          <div className="metric-label">Baseline Revenue</div>
          <div className="metric-value">
            ${baselineResult.avg.toFixed(0)}
          </div>
        </div>

        <div className="card">
          <div className="metric-label">After Strategy</div>
          <div className="metric-value">
            ${strategyResult.avg.toFixed(0)}
          </div>
        </div>

        <div className="card">
          <div className="metric-label">Revenue Uplift</div>
          <div className="metric-value">
            {uplift.toFixed(1)}%
          </div>
        </div>
      </div>

      {/* CHART */}
      <div className="card" style={{ marginTop: 30 }}>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="value" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* INSIGHT */}
      <div className="note-box" style={{ marginTop: 30 }}>
        <b>Business Insight:</b>
        <ul>
          <li>Revenue hiện tại bị kéo bởi occupancy (volume-driven)</li>
          <li>Pricing chưa tối ưu → còn dư địa tăng ADR</li>
          <li>OTA gây leakage qua cancel/no-show</li>
          <li>Ancillary chưa được khai thác tối đa</li>
          <li>
            👉 Strategy tốt nhất thường là kết hợp: Pricing + Reduce OTA + Upsell
          </li>
        </ul>
      </div>
    </div>
  );
}