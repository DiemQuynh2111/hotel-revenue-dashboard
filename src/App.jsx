import React, { useState, useMemo, useCallback } from "react";
import * as XLSX from "xlsx";

/* =========================
   CONFIG (KHÔNG HARD CODE RẢI RÁC)
========================= */
const CONFIG = {
  TOTAL_CAPACITY: { RT_STD: 1395, RT_DLX: 868, RT_STE: 217 },
  TOTAL_ROOMS: 2480,
  SOLD_ON_HAND: { RT_STD: 595, RT_DLX: 370, RT_STE: 90 },

  MONTE_CARLO_RUNS: 5000,

  DEMAND_RANGE: [0.75, 0.95],
  CANCEL_RANGE: [0.08, 0.13],
};

/* =========================
   UTILS
========================= */
const currency = (v) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(v || 0));

const formatNumber = (v) =>
  new Intl.NumberFormat("en-US").format(Math.round(Number(v || 0)));

const isWeekend = (dateVal) => {
  const d = new Date(dateVal);
  if (isNaN(d)) return false;
  const day = d.getDay();
  return day === 5 || day === 6;
};

/* =========================
   EXCEL READER
========================= */
const readExcel = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: "array", cellDates: true });
        resolve(wb);
      } catch {
        reject("Excel read error");
      }
    };

    reader.readAsArrayBuffer(file);
  });

/* =========================
   BUSINESS ENGINE
========================= */
const buildStrategies = (stats, histAncRatio) => {
  const basePrice = (obj, fallback) =>
    obj.sum / (obj.count || 1) || fallback;

  return {
    Weekday: {
      RT_STD: {
        name: "STANDARD",
        oldPrice: basePrice(stats.Weekday.RT_STD, 92),
        targetRatio: 0.6,
      },
      RT_DLX: {
        name: "DELUXE",
        oldPrice: basePrice(stats.Weekday.RT_DLX, 131),
        targetRatio: 0.5,
      },
      RT_STE: {
        name: "SUITE",
        oldPrice: basePrice(stats.Weekday.RT_STE, 215),
        targetRatio: 0.7,
      },
    },
    Weekend: {
      RT_STD: {
        name: "STANDARD",
        oldPrice: basePrice(stats.Weekend.RT_STD, 96),
        targetRatio: 0.8,
      },
      RT_DLX: {
        name: "DELUXE",
        oldPrice: basePrice(stats.Weekend.RT_DLX, 135),
        targetRatio: 0.6,
      },
      RT_STE: {
        name: "SUITE",
        oldPrice: basePrice(stats.Weekend.RT_STE, 225),
        targetRatio: 0.9,
      },
    },
  };
};

/* =========================
   MONTE CARLO ENGINE
========================= */
const runMonteCarlo = ({
  extraRoomsToSell,
  processedRooms,
  baseRevenue,
  histAncRatio,
}) => {
  let total = 0;

  for (let i = 0; i < CONFIG.MONTE_CARLO_RUNS; i++) {
    const demand =
      CONFIG.DEMAND_RANGE[0] +
      Math.random() * (CONFIG.DEMAND_RANGE[1] - CONFIG.DEMAND_RANGE[0]);

    const cancel =
      CONFIG.CANCEL_RANGE[0] +
      Math.random() * (CONFIG.CANCEL_RANGE[1] - CONFIG.CANCEL_RANGE[0]);

    const conversion = demand * (1 - cancel);

    const sold = extraRoomsToSell * conversion;

    const avgPrice =
      processedRooms.reduce((s, r) => s + r.dynamicAdr, 0) /
      processedRooms.length;

    total += sold * avgPrice;
  }

  const roomRev = total / CONFIG.MONTE_CARLO_RUNS;
  const ancRev = roomRev * histAncRatio;

  return {
    roomRev,
    ancRev,
    totalRev: baseRevenue + roomRev + ancRev,
  };
};

/* =========================
   MAIN APP
========================= */
export default function App() {
  const [historyFile, setHistoryFile] = useState(null);
  const [forecastFile, setForecastFile] = useState(null);
  const [appData, setAppData] = useState(null);
  const [loading, setLoading] = useState(false);

  const [dayType, setDayType] = useState("Weekday");
  const [leadTime, setLeadTime] = useState(15);
  const [targetOcc, setTargetOcc] = useState(60);

  /* =========================
     PROCESS DATA
  ========================= */
  const handleProcess = async () => {
    if (!historyFile || !forecastFile)
      return alert("Missing files");

    setLoading(true);

    try {
      const [histWb, forecastWb] = await Promise.all([
        readExcel(historyFile),
        readExcel(forecastFile),
      ]);

      const sheet = forecastWb.SheetNames[0];
      const summary = XLSX.utils.sheet_to_json(forecastWb.Sheets[sheet]);

      const metrics = {};
      summary.forEach((r) => {
        const k = r.metric || Object.values(r)[0];
        const v = r.value || Object.values(r)[1];
        metrics[k] = Number(v || 0);
      });

      const histSheet = histWb.SheetNames[0];
      const hist = XLSX.utils.sheet_to_json(histWb.Sheets[histSheet]);

      let roomNet = 0;
      let ancNet = 0;

      const stats = {
        Weekday: {
          RT_STD: { sum: 0, count: 0 },
          RT_DLX: { sum: 0, count: 0 },
          RT_STE: { sum: 0, count: 0 },
        },
        Weekend: {
          RT_STD: { sum: 0, count: 0 },
          RT_DLX: { sum: 0, count: 0 },
          RT_STE: { sum: 0, count: 0 },
        },
      };

      hist.forEach((r) => {
        const amt = Number(r.amount_net || 0);
        if (!amt) return;

        if (r.charge_category === "Room") {
          roomNet += amt;
          const dt = isWeekend(r.posting_date)
            ? "Weekend"
            : "Weekday";

          const room = r.room_type_id;
          if (stats[dt][room]) {
            stats[dt][room].sum += amt;
            stats[dt][room].count++;
          }
        } else {
          ancNet += amt;
        }
      });

      const histAncRatio = ancNet / (roomNet || 1);

      setAppData({
        metrics,
        stats,
        histAncRatio,
      });

      setLoading(false);
    } catch (e) {
      setLoading(false);
      alert("Processing error");
    }
  };

  /* =========================
     SIMULATION (MEMOIZED)
  ========================= */
  const sim = useMemo(() => {
    if (!appData) return null;

    const sold = CONFIG.SOLD_ON_HAND;
    const cap = CONFIG.TOTAL_CAPACITY;

    const targetRooms = Math.round(
      CONFIG.TOTAL_ROOMS * (targetOcc / 100)
    );

    const extra = Math.max(
      0,
      targetRooms - (sold.RT_STD + sold.RT_DLX + sold.RT_STE)
    );

    const strategies = buildStrategies(
      appData.stats,
      appData.histAncRatio
    );

    const processed = ["RT_STD", "RT_DLX", "RT_STE"].map((k) => {
      const strat = strategies[dayType][k];

      const baseAvail = cap[k] - sold[k];
      const inventoryFactor = 0.2 + 0.8 * (leadTime / 30);

      const avai = Math.round(baseAvail * inventoryFactor);

      const multiplier =
        leadTime <= 5 ? 1.15 : leadTime >= 15 ? 0.9 : 1;

      const dynamicAdr = strat.oldPrice * multiplier;

      return {
        key: k,
        avai,
        dynamicAdr,
        oldPrice: strat.oldPrice,
      };
    });

    const mc = runMonteCarlo({
      extraRoomsToSell: extra,
      processedRooms: processed,
      baseRevenue: appData.metrics["On-hand Total Revenue"] || 0,
      histAncRatio: appData.histAncRatio,
    });

    return {
      extra,
      processed,
      mc,
    };
  }, [appData, dayType, leadTime, targetOcc]);

  /* =========================
     UI
  ========================= */
  if (!appData) {
    return (
      <div style={{ padding: 40 }}>
        <h2>Revenue System</h2>

        <input
          type="file"
          onChange={(e) => setHistoryFile(e.target.files[0])}
        />
        <input
          type="file"
          onChange={(e) => setForecastFile(e.target.files[0])}
        />

        <button onClick={handleProcess}>
          {loading ? "Processing..." : "Run Model"}
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: 30 }}>
      <h2>Simulation Dashboard</h2>

      <div>
        Target Occupancy:
        <input
          type="range"
          min="40"
          max="95"
          value={targetOcc}
          onChange={(e) => setTargetOcc(+e.target.value)}
        />
        {targetOcc}%
      </div>

      <div>
        Lead Time:
        <input
          type="range"
          min="1"
          max="30"
          value={leadTime}
          onChange={(e) => setLeadTime(+e.target.value)}
        />
        {leadTime} days
      </div>

      <div>
        <h3>Result</h3>
        <p>Extra Rooms: {sim.extra}</p>
        <p>Room Revenue: {currency(sim.mc.roomRev)}</p>
        <p>Ancillary: {currency(sim.mc.ancRev)}</p>
        <h3>Total: {currency(sim.mc.totalRev)}</h3>
      </div>

      <table border="1">
        <thead>
          <tr>
            <th>Room</th>
            <th>Inventory</th>
            <th>Price</th>
          </tr>
        </thead>
        <tbody>
          {sim.processed.map((r) => (
            <tr key={r.key}>
              <td>{r.key}</td>
              <td>{r.avai}</td>
              <td>{currency(r.dynamicAdr)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}