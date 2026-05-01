import React, { useState, useMemo } from "react";
import * as XLSX from "xlsx";

// ============================================================================
// MODULE 1: UTILITIES
// ============================================================================
const Utils = {
  currency: (v) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v || 0),
  formatNum: (v) => new Intl.NumberFormat("en-US").format(Math.round(v || 0)),
  randomNormal: (mean, stdDev) => {
    let u = 0, v = 0;
    while(u === 0) u = Math.random();
    while(v === 0) v = Math.random();
    return mean + (Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v)) * stdDev;
  }
};

const CONFIG = {
  MC_ITERATIONS: 2000,
  DAYS_IN_MONTH: 31,
  TOTAL_ROOMS: 80,
  ANCILLARY_RATIO: 0.18,
  MC_PARAMS: { DEMAND_MEAN: 0.85, DEMAND_STD_DEV: 0.05, CANCEL_MEAN: 0.10, CANCEL_STD_DEV: 0.02 },
  DEFAULT_METRICS: { forecast: 125494, onHand: 110744 }
};

// ============================================================================
// MODULE 2: DATA EXTRACTOR (XỬ LÝ DỮ LIỆU FILE)
// ============================================================================
const DataExtractor = {
  readFile: (file) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          resolve(XLSX.read(new Uint8Array(e.target.result), { type: "array", cellDates: true }));
        } catch (err) { resolve(null); }
      };
      reader.onerror = () => resolve(null);
      reader.readAsArrayBuffer(file);
    });
  },

  getSheetData: (workbook, keyword, columnKeywords = []) => {
    if (!workbook) return [];
    let sheetName = workbook.SheetNames.find(n => n.toLowerCase().includes(keyword.toLowerCase()));
    if (!sheetName && workbook.SheetNames.length === 1) sheetName = workbook.SheetNames[0];

    if (!sheetName) {
      sheetName = workbook.SheetNames.find(n => {
        const data = XLSX.utils.sheet_to_json(workbook.Sheets[n], { header: 1 });
        if (data.length > 0) {
          const headerStr = Object.values(data[0] || {}).join("").toLowerCase();
          return columnKeywords.some(kw => headerStr.includes(kw));
        }
        return false;
      });
    }
    if (!sheetName) return [];
    return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
  },

  processRealData: async (historyFile, forecastFile) => {
    const [histWb, forecastWb] = await Promise.all([
      DataExtractor.readFile(historyFile), 
      DataExtractor.readFile(forecastFile)
    ]);

    // 1. Quét Forecast
    let metrics = { ...CONFIG.DEFAULT_METRICS };
    const forecastData = DataExtractor.getSheetData(forecastWb, "summary", ["forecast", "hand"]);
    if (forecastData.length > 0) {
      forecastData.forEach(row => {
        const vals = Object.values(row);
        if (vals.length >= 2 && !isNaN(parseFloat(vals[1]))) {
          const keyStr = String(vals[0]).toLowerCase();
          if (keyStr.includes("forecast total")) metrics.forecast = parseFloat(vals[1]);
          if (keyStr.includes("on-hand total")) metrics.onHand = parseFloat(vals[1]);
        }
      });
    }

    // 2. Quét RoomInventory
    const invData = DataExtractor.getSheetData(histWb, "inventory", ["available", "total"]);
    let rawStats = {
      Weekday: { RT_STD: { cap:0, avai:0, days:new Set() }, RT_DLX: { cap:0, avai:0, days:new Set() }, RT_STE: { cap:0, avai:0, days:new Set() } },
      Weekend: { RT_STD: { cap:0, avai:0, days:new Set() }, RT_DLX: { cap:0, avai:0, days:new Set() }, RT_STE: { cap:0, avai:0, days:new Set() } }
    };
    let syncStatus = false;

    invData.forEach(row => {
      let isTargetMonth = false;
      let dateKey = "";

      for (let key in row) {
        const val = row[key];
        if (val instanceof Date) {
          if (val.getFullYear() === 2026 && val.getMonth() === 0) { isTargetMonth = true; dateKey = val.toISOString().split('T')[0]; }
        } else if (typeof val === 'string') {
          if (val.includes("2026-01") || val.includes("2026/01") || val.includes("1/2026")) { isTargetMonth = true; dateKey = val; }
        }
      }

      if (isTargetMonth) {
        syncStatus = true;
        const rtRaw = String(row.room_type_id || row.room_type || row.RoomType || "").toUpperCase();
        let rt = "RT_STD";
        if (rtRaw.includes("DLX") || rtRaw.includes("DELUXE")) rt = "RT_DLX";
        if (rtRaw.includes("STE") || rtRaw.includes("SUITE")) rt = "RT_STE";

        const dtRaw = String(row.day_type || row.day_of_week || "").toLowerCase();
        const dt = (dtRaw.includes("weekend") || dtRaw.includes("sat") || dtRaw.includes("sun")) ? "Weekend" : "Weekday";

        let capKey = Object.keys(row).find(k => k.toLowerCase().includes("total") || k.toLowerCase().includes("capacity"));
        let avaiKey = Object.keys(row).find(k => k.toLowerCase().includes("available") || k.toLowerCase().includes("sale"));

        const cap = capKey ? parseFloat(row[capKey]) : 0;
        const avai = avaiKey ? parseFloat(row[avaiKey]) : 0;

        if (!isNaN(cap) && !isNaN(avai) && dateKey) {
          rawStats[dt][rt].cap += cap;
          rawStats[dt][rt].avai += avai;
          rawStats[dt][rt].days.add(dateKey);
        }
      }
    });

    // 3. Đóng gói kết quả
    let finalInventory = { Weekday: {}, Weekend: {} };
    const ROOM_NAMES = { RT_STD: "STANDARD ROOM", RT_DLX: "DELUXE ROOM", RT_STE: "EXECUTIVE SUITE" };
    const BASE_PRICES = { RT_STD: 95, RT_DLX: 129, RT_STE: 220 }; 

    ["Weekday", "Weekend"].forEach(dayType => {
      ["RT_STD", "RT_DLX", "RT_STE"].forEach(roomType => {
        const stat = rawStats[dayType][roomType];
        const uniqueDaysCount = stat.days.size > 0 ? stat.days.size : 1; 
        
        const avgCapacity = Math.round(stat.cap / uniqueDaysCount);
        const avgAvai = Math.round(stat.avai / uniqueDaysCount);
        const avgSold = avgCapacity - avgAvai;

        finalInventory[dayType][roomType] = {
          name: ROOM_NAMES[roomType],
          capacity: syncStatus && avgCapacity > 0 ? avgCapacity : (roomType === "RT_STD" ? 45 : roomType === "RT_DLX" ? 28 : 7),
          sold: syncStatus && avgSold >= 0 ? avgSold : (roomType === "RT_STD" ? 18 : roomType === "RT_DLX" ? 12 : 3),
          baseAvai: syncStatus && avgAvai > 0 ? avgAvai : (roomType === "RT_STD" ? 27 : roomType === "RT_DLX" ? 16 : 4),
          oldPrice: BASE_PRICES[roomType]
        };
      });
    });

    return { metrics, inventoryData: finalInventory, syncStatus };
  }
};

// ============================================================================
// MODULE 3: CHIẾN LƯỢC KINH DOANH
// ============================================================================
const STRATEGIES = {
  Weekday: {
    RT_STD: { who: ["1. Corporate (B2B): Tạo nền tảng công suất."], where: ["Direct B2B: Miễn hoa hồng.", "OTA: Phân phối phút chót."], ancillary: "MICE Bundle (F&B + Laundry)" },
    RT_DLX: { who: ["1. Leisure: Nguồn thu chủ lực giữa tuần."], where: ["Direct Website: Chặn hủy ảo."], ancillary: "Spa & Tour Bundle" },
    RT_STE: { who: ["1. MICE VIPs: Quản lý cấp cao sự kiện."], where: ["Direct Phone: Tuyệt đối không bán Suite qua OTA."], ancillary: "Luxury Service Bundle" }
  },
  Weekend: {
    RT_STD: { who: ["1. Leisure: Cầu du lịch tự túc cuối tuần cao."], where: ["OTA: Kéo Volume mạnh kèm NRF.", "Direct Web: Kéo khách thành viên."], ancillary: "Buffet Bundle (F&B)" },
    RT_DLX: { who: ["1. Leisure Couples: Sẵn sàng chi trả cao."], where: ["Direct Website: Chạy gói Combo Weekend."], ancillary: "Spa Retreat Package" },
    RT_STE: { who: ["1. Leisure VIP: Lấp đầy Suite đạt đỉnh."], where: ["Direct Phone: Bảo vệ dòng tiền."], ancillary: "Premium Heritage Bundle" }
  }
};

// ============================================================================
// MODULE 4: MAIN APP COMPONENT
// ============================================================================
export default function App() {
  const [historyFile, setHistoryFile] = useState(null);
  const [forecastFile, setForecastFile] = useState(null);
  
  const [appData, setAppData] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const [selectedDayType, setSelectedDayType] = useState("Weekday");
  const [simLeadTime, setSimLeadTime] = useState(30); 
  const [targetOccupancy, setTargetOccupancy] = useState(65);

  const handleProcessData = async () => {
    if (!historyFile || !forecastFile) return alert("Hệ thống yêu cầu cung cấp đủ 2 file dữ liệu.");
    setIsProcessing(true);
    const processedData = await DataExtractor.processRealData(historyFile, forecastFile);
    setAppData(processedData);
    setIsProcessing(false);
  };

  // ĐỘNG CƠ PHÂN TÍCH VÀ MÔ PHỎNG ĐỘNG LỰC HỌC TỒN KHO
  const analyticsData = useMemo(() => {
    if (!appData || !appData.inventoryData) return null;

    const baseData = appData.inventoryData[selectedDayType];
    const totalDailyRooms = baseData.RT_STD.capacity + baseData.RT_DLX.capacity + baseData.RT_STE.capacity;
    const totalSoldToday = baseData.RT_STD.sold + baseData.RT_DLX.sold + baseData.RT_STE.sold;
    
    const baseOccupancy = (totalSoldToday / totalDailyRooms) * 100;

    // Tính lượng phòng đêm cần bán thêm (Mục tiêu tổng)
    const targetDailyRooms = Math.round(totalDailyRooms * (targetOccupancy / 100));
    const maxExtraDailyRooms = Math.max(0, targetDailyRooms - totalSoldToday);
    const extraMonthlyRoomNightsToSell = maxExtraDailyRooms * CONFIG.DAYS_IN_MONTH; 

    // ĐỊNH GIÁ 5 TẦNG THEO LEAD TIME
    let leadMultiplier = 1.0;
    let leadReason = "";

    if (simLeadTime <= 3) {
      leadMultiplier = 1.15;
      leadReason = "[Tier 1 - Khẩn cấp]: Khách hàng cận ngày. Khuyến nghị TĂNG GIÁ 15%.";
    } else if (simLeadTime <= 7) {
      leadMultiplier = 1.05;
      leadReason = "[Tier 2 - Ngắn hạn]: Khách chốt lịch trình. Khuyến nghị TĂNG GIÁ 5%.";
    } else if (simLeadTime <= 14) {
      leadMultiplier = 1.00;
      leadReason = "[Tier 3 - Tiêu chuẩn]: Cung cầu cân bằng. DUY TRÌ GIÁ BASE.";
    } else if (simLeadTime <= 21) {
      leadMultiplier = 0.95;
      leadReason = "[Tier 4 - Đặt sớm]: Kích cầu. GIẢM GIÁ 5%, kèm Hủy mất phí 50%.";
    } else {
      leadMultiplier = 0.90;
      leadReason = "[Tier 5 - Dài hạn]: Thu hút Base Volume. GIẢM GIÁ 10%, kèm Non-refundable.";
    }

    // TÍNH TOÁN CẬP NHẬT ĐÃ BÁN & KHÁCH TRẢ THEO LEAD TIME
    // Tiến độ Lead Time (30 ngày -> 0%; 1 ngày -> 100%)
    const pickupProgress = (30 - simLeadTime) / 29;

    const processedRooms = ["RT_STD", "RT_DLX", "RT_STE"].map(key => {
      const roomBase = baseData[key];
      const strat = STRATEGIES[selectedDayType][key];
      
      // Tính Đã bán (Cập nhật dần theo tiến độ Lead Time)
      const roomTargetShare = Math.round(maxExtraDailyRooms * (roomBase.capacity / totalDailyRooms));
      const pickupRooms = Math.round(roomTargetShare * pickupProgress);
      const dynamicSold = Math.min(roomBase.capacity, roomBase.sold + pickupRooms);

      // Tính Khách trả (Giả định Turnover Rate 25% số khách đang ở)
      const checkOutRooms = Math.round(dynamicSold * 0.25);

      // Tính Sẵn bán (Công thức Front Office chuẩn: Sức chứa - Đã bán + Khách trả)
      const dynamicAvai = Math.max(0, Math.min(roomBase.capacity, roomBase.capacity - dynamicSold + checkOutRooms));

      const dynamicAdr = roomBase.oldPrice * leadMultiplier;
      const priceDiff = ((dynamicAdr / roomBase.oldPrice) - 1) * 100;

      return { key, dynamicSold, checkOutRooms, avai: dynamicAvai, dynamicAdr, priceDiff, ...roomBase, ...strat };
    });

    // MÔ PHỎNG MONTE CARLO
    let successfulRoomRev = 0;
    const avgBaseAdr = processedRooms.reduce((sum, r) => sum + r.oldPrice, 0) / 3;

    for (let i = 0; i < CONFIG.MC_ITERATIONS; i++) {
      const demandCapture = Utils.randomNormal(CONFIG.MC_PARAMS.DEMAND_MEAN, CONFIG.MC_PARAMS.DEMAND_STD_DEV);
      const cancelRatio = Utils.randomNormal(CONFIG.MC_PARAMS.CANCEL_MEAN, CONFIG.MC_PARAMS.CANCEL_STD_DEV);
      
      const boundedDemand = Math.max(0, Math.min(1, demandCapture));
      const boundedCancel = Math.max(0, Math.min(1, cancelRatio));

      const conversionRate = boundedDemand * (1 - boundedCancel);
      const simulatedMonthlyRoomsSold = extraMonthlyRoomNightsToSell * conversionRate;
      
      successfulRoomRev += (simulatedMonthlyRoomsSold * avgBaseAdr);
    }

    const meanRoomRev = successfulRoomRev / CONFIG.MC_ITERATIONS;
    const meanAncillaryRev = meanRoomRev * CONFIG.ANCILLARY_RATIO; 
    const totalProjectedRev = appData.metrics.onHand + meanRoomRev + meanAncillaryRev;
    
    return { baseOccupancy, extraMonthlyRoomNightsToSell, leadReason, processedRooms, impact: { totalProjectedRev, meanRoomRev, meanAncillaryRev } };

  }, [appData, selectedDayType, simLeadTime, targetOccupancy]);

  if (!appData) {
    return (
      <div style={STYLES.layoutCenter}>
        <div style={STYLES.bgBlur} />
        <div style={STYLES.loginCard}>
          <h1 style={STYLES.heading}>Hệ thống Hoạch định Doanh thu (BI)</h1>
          <p style={STYLES.subHeading}>Phân hệ Chẩn đoán & Kê toa Chiến lược - Heritage Hue Hotel</p>
          
          <div style={STYLES.flexGap}>
            <div style={STYLES.uploadBox}>
              <p style={STYLES.uploadTitle}>1. DỮ LIỆU LỊCH SỬ (CLEANED FILE)</p>
              <input type="file" accept=".xlsx,.csv" onChange={(e) => setHistoryFile(e.target.files[0])} />
            </div>
            <div style={STYLES.uploadBox}>
              <p style={STYLES.uploadTitle}>2. DỮ LIỆU DỰ BÁO (FORECAST FILE)</p>
              <input type="file" accept=".xlsx,.csv" onChange={(e) => setForecastFile(e.target.files[0])} />
            </div>
          </div>
          <button onClick={handleProcessData} disabled={isProcessing} style={STYLES.btnPrimary}>
            {isProcessing ? "ĐANG IMPORT VÀ TRÍCH XUẤT DỮ LIỆU..." : "Import Dữ liệu & Kết xuất Báo cáo"}
          </button>
        </div>
      </div>
    );
  }

  const { baseOccupancy, extraMonthlyRoomNightsToSell, leadReason, processedRooms, impact } = analyticsData;
  const growthPercent = ((impact.totalProjectedRev / appData.metrics.forecast) - 1) * 100;

  return (
    <div style={STYLES.layoutMain}>
      <div style={STYLES.bgBlurLight} />
      <div style={STYLES.dashboardContainer}>
        
        <header style={STYLES.header}>
          <div>
            <h1 style={STYLES.headerTitle}>Báo cáo Quản trị & Tối ưu Doanh thu - Tháng 01/2026</h1>
            <p style={STYLES.headerSub}>Ứng dụng Pipeline Trích xuất Dữ liệu, Định giá 5 Tầng & Monte Carlo.</p>
          </div>
          <div style={appData.syncStatus ? STYLES.statusSuccess : STYLES.statusWarning}>
             {appData.syncStatus ? "ĐÃ ĐỒNG BỘ DỮ LIỆU FILE THÁNG 1" : "DỮ LIỆU FILE LỖI - ĐANG DÙNG BASELINE"}
          </div>
        </header>

        <div style={STYLES.contentArea}>
          <div style={STYLES.grid2Col}>
            <div style={STYLES.metricCardActive}>
              <span style={STYLES.metricLabel}>DOANH THU ĐÃ CHỐT (ON-HAND)</span>
              <div style={STYLES.metricValue}>{Utils.currency(appData.metrics.onHand)}</div>
            </div>
            <div style={STYLES.metricCard}>
              <span style={STYLES.metricLabel}>DỰ BÁO DOANH THU TĨNH (BASELINE)</span>
              <div style={STYLES.metricValue}>{Utils.currency(appData.metrics.forecast)}</div>
            </div>
          </div>

          <section style={STYLES.controlSection}>
            <div>
              <div style={STYLES.flexBetween}>
                <h2 style={STYLES.controlTitle}>MỤC TIÊU CÔNG SUẤT (OCCUPANCY):</h2>
                <span style={STYLES.badge}>{targetOccupancy}%</span>
              </div>
              <input type="range" min="40" max="95" value={targetOccupancy} onChange={(e) => setTargetOccupancy(Number(e.target.value))} style={STYLES.slider} />
              <div style={STYLES.helperText}>
                Gốc Lịch sử (từ File): <strong>{baseOccupancy.toFixed(1)}%</strong>. Cần bán thêm: <strong style={{color:"#1e3a8a"}}>{Utils.formatNum(extraMonthlyRoomNightsToSell)} Đêm phòng</strong>.
              </div>
            </div>

            <div>
              <div style={STYLES.flexBetween}>
                <h2 style={STYLES.controlTitle}>THỜI GIAN ĐẶT PHÒNG (LEAD TIME):</h2>
                <span style={STYLES.badge}>{simLeadTime} NGÀY</span>
              </div>
              <input type="range" min="1" max="30" value={simLeadTime} onChange={(e) => setSimLeadTime(Number(e.target.value))} style={STYLES.sliderReverse} />
              <div style={STYLES.alertBox}>
                <strong>PHẢN ỨNG GIÁ:</strong> {leadReason}
              </div>
            </div>
          </section>

          <div style={STYLES.flexGapSmall}>
            <button onClick={() => setSelectedDayType("Weekday")} style={selectedDayType === "Weekday" ? STYLES.tabActive : STYLES.tab}>BỐI CẢNH LÀM VIỆC: NGÀY TRONG TUẦN</button>
            <button onClick={() => setSelectedDayType("Weekend")} style={selectedDayType === "Weekend" ? STYLES.tabActive : STYLES.tab}>BỐI CẢNH LÀM VIỆC: CUỐI TUẦN</button>
          </div>

          <section style={{ marginBottom: "50px" }}>
            <table style={STYLES.table}>
              <thead>
                <tr style={STYLES.tableHead}>
                  <th style={STYLES.th}>HẠNG PHÒNG & TÌNH TRẠNG NGÀY</th>
                  <th style={STYLES.th}>ĐỊNH GIÁ ĐA TẦNG (ADR)</th>
                  <th style={STYLES.th}>MỤC TIÊU PHÂN KHÚC KHÁCH HÀNG</th>
                  <th style={STYLES.th}>CHIẾN LƯỢC KÊNH PHÂN PHỐI</th>
                  <th style={STYLES.th}>DỊCH VỤ GIA TĂNG (BUNDLE)</th>
                </tr>
              </thead>
              <tbody style={{ background: "white" }}>
                {processedRooms.map(room => (
                  <tr key={room.key} style={STYLES.tableRow}>
                    <td style={STYLES.td}>
                      <div style={STYLES.roomName}>{room.name}</div>
                      <div style={STYLES.roomStat}>Sức chứa (Capacity): <strong>{room.capacity} phòng</strong></div>
                      
                      {/* TÍNH NĂNG CẬP NHẬT THEO LEAD TIME ĐÃ ĐƯỢC PHỤC HỒI */}
                      <div style={{ fontSize: "12px", color: "#1e40af", marginBottom: "4px", fontWeight: "700" }}>
                        Đã bán (Cập nhật): <strong>{room.dynamicSold} phòng</strong>
                      </div>
                      <div style={{ fontSize: "12px", color: "#059669", marginBottom: "10px", fontWeight: "700" }}>
                        Khách trả (Check-out): <strong>+{room.checkOutRooms} phòng</strong>
                      </div>
                      
                      <div style={STYLES.roomAvai}>
                        Sẵn bán (Available): {Utils.formatNum(room.avai)}
                      </div>
                    </td>
                    <td style={tdStyle}>
                      <div style={STYLES.priceOld}>{Utils.currency(room.oldPrice)}</div>
                      <div style={STYLES.priceNew}>{Utils.currency(room.dynamicAdr)}</div>
                      <div style={{...STYLES.priceDiff, color: room.priceDiff >= 0 ? "#059669" : "#dc2626"}}>
                        ({room.priceDiff >= 0 ? "+" : ""}{room.priceDiff.toFixed(1)}%)
                      </div>
                    </td>
                    <td style={STYLES.td}>
                      <ul style={STYLES.ul}>
                        {room.who.map((w, idx) => <li key={idx} style={{ marginBottom: "8px" }}>{w}</li>)}
                      </ul>
                    </td>
                    <td style={STYLES.td}>
                      <ul style={STYLES.ul}>
                        {room.where.map((w, idx) => <li key={idx} style={{ marginBottom: "8px" }}>{w}</li>)}
                      </ul>
                    </td>
                    <td style={STYLES.tdAncillary}>{room.ancillary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section style={STYLES.impactSection}>
            <h2 style={STYLES.impactHeader}>Kết quả Đạt được Kỳ vọng (Monte Carlo Analysis - Box Muller)</h2>
            <div style={STYLES.impactGrid}>
              <div style={STYLES.impactTextCol}>
                <p style={STYLES.impactDesc}>
                  Hệ thống thực thi <strong>{CONFIG.MC_ITERATIONS} phiên bản giả lập</strong> áp dụng phân phối chuẩn để định lượng rủi ro kinh tế học: Lực cầu thị trường và Tỷ lệ hủy phòng ảo.
                  <br/><br/>
                  Kết hợp <strong>Định giá đa tầng</strong> và <strong>Mục tiêu Công suất {targetOccupancy}%</strong>, Khối Kinh doanh có cơ sở phá vỡ giới hạn dự báo tĩnh.
                </p>
                <div style={STYLES.impactBaseBox}>
                  <div style={STYLES.impactBaseLabel}>MỐC DỰ BÁO TĨNH (BASELINE)</div>
                  <div style={STYLES.impactBaseVal}>{Utils.currency(appData.metrics.forecast)}</div>
                </div>
              </div>

              <div style={STYLES.impactResultGrid}>
                <div style={STYLES.impactTotalBox}>
                  <div style={STYLES.impactTotalLabel}>TỔNG DOANH THU KỲ VỌNG (EXPECTED VALUE)</div>
                  <div style={STYLES.impactTotalVal}>{Utils.currency(impact.totalProjectedRev)}</div>
                </div>
                <div style={STYLES.impactGrowthBox}>
                  <div style={{fontSize: "11px", fontWeight: "700", color: "#059669"}}>TĂNG TRƯỞNG</div>
                  <div style={{fontSize: "24px", fontWeight: "800", color: "#059669"}}>+{growthPercent.toFixed(1)}%</div>
                </div>
                <div style={STYLES.impactSubBox}>
                  <div style={{fontSize: "11px", fontWeight: "700", color: "#475569"}}>ROOM REVENUE GAIN</div>
                  <div style={{fontSize: "20px", fontWeight: "800", color: "#0f172a"}}>+{Utils.currency(impact.meanRoomRev)}</div>
                </div>
                <div style={STYLES.impactAncilBox}>
                  <div style={{fontSize: "11px", fontWeight: "700", color: "#475569"}}>ANCILLARY REVENUE GAIN</div>
                  <div style={{fontSize: "20px", fontWeight: "800", color: "#2563eb"}}>+{Utils.currency(impact.meanAncillaryRev)}</div>
                </div>
              </div>
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 5. THEME & STYLES 
// ============================================================================
const STYLES = {
  layoutCenter: { minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", position: "relative", padding: "20px", fontFamily: "system-ui, sans-serif" },
  bgBlur: { position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", background: "#f8fafc", zIndex: -1 },
  loginCard: { background: "white", padding: "50px", width: "100%", maxWidth: "800px", borderTop: "4px solid #1e3a8a", boxShadow: "0 10px 30px rgba(0,0,0,0.1)" },
  heading: { color: "#0f172a", margin: "0 0 10px 0", fontSize: "28px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "1px" },
  subHeading: { color: "#64748b", margin: "0 0 30px 0", fontSize: "14px", fontWeight: "500" },
  flexGap: { display: "flex", gap: "20px", marginBottom: "30px" },
  uploadBox: { flex: 1, border: "1px solid #cbd5e1", padding: "25px 20px", background: "#f8fafc" },
  uploadTitle: { fontSize: "12px", fontWeight: "700", color: "#1e3a8a", margin: "0 0 10px 0" },
  btnPrimary: { background: "#1e3a8a", color: "white", padding: "16px", border: "none", cursor: "pointer", fontWeight: "700", letterSpacing: "1px", width: "100%", fontSize: "14px", textTransform: "uppercase" },
  
  layoutMain: { minHeight: "100vh", padding: "40px", fontFamily: "system-ui, sans-serif", color: "#0f172a" },
  bgBlurLight: { position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", background: "#f1f5f9", zIndex: -1 },
  dashboardContainer: { maxWidth: "1400px", margin: "0 auto", background: "white", boxShadow: "0 10px 40px rgba(0,0,0,0.1)", border: "1px solid #e2e8f0" },
  header: { background: "#0f172a", padding: "30px 40px", color: "white", borderBottom: "4px solid #1e3a8a", display: "flex", justifyContent: "space-between", alignItems: "center" },
  headerTitle: { fontSize: "22px", fontWeight: "800", textTransform: "uppercase", margin: "0 0 8px 0", letterSpacing: "1px" },
  headerSub: { margin: 0, color: "#94a3b8", fontSize: "13px", fontWeight: "500" },
  statusSuccess: { padding: "8px 15px", background: "#059669", color: "white", fontWeight: "800", fontSize: "12px", borderRadius: "4px" },
  statusWarning: { padding: "8px 15px", background: "#b45309", color: "white", fontWeight: "800", fontSize: "12px", borderRadius: "4px" },
  contentArea: { padding: "40px" },
  
  grid2Col: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "25px", marginBottom: "40px" },
  metricCardActive: { padding: "25px", border: "1px solid #cbd5e1", background: "#f8fafc", borderLeft: "4px solid #1e3a8a" },
  metricCard: { padding: "25px", border: "1px solid #cbd5e1", background: "white", borderLeft: "4px solid #64748b" },
  metricLabel: { fontSize: "12px", color: "#475569", fontWeight: "700", letterSpacing: "0.5px" },
  metricValue: { fontSize: "32px", fontWeight: "800", color: "#0f172a", marginTop: "10px" },
  
  controlSection: { marginBottom: "35px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "40px", padding: "35px", background: "#f8fafc", border: "1px solid #e2e8f0" },
  flexBetween: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px" },
  controlTitle: { fontSize: "14px", fontWeight: "700", color: "#0f172a", margin: 0 },
  badge: { fontSize: "16px", fontWeight: "800", color: "white", background: "#1e3a8a", padding: "4px 12px" },
  slider: { width: "100%", accentColor: "#1e3a8a", cursor: "pointer" },
  sliderReverse: { width: "100%", accentColor: "#1e3a8a", cursor: "pointer", direction: "rtl" },
  helperText: { marginTop: "15px", fontSize: "13px", color: "#475569", lineHeight: "1.6" },
  alertBox: { marginTop: "15px", fontSize: "13px", color: "#1e3a8a", lineHeight: "1.6", borderLeft: "3px solid #1e3a8a", paddingLeft: "15px", background: "#eff6ff", padding: "10px" },
  
  flexGapSmall: { display: "flex", gap: "5px", marginBottom: "20px" },
  tabActive: { flex: 1, padding: "15px", border: "1px solid #cbd5e1", cursor: "pointer", background: "#1e3a8a", color: "white", fontWeight: "700", fontSize: "13px", transition: "0.2s" },
  tab: { flex: 1, padding: "15px", border: "1px solid #cbd5e1", cursor: "pointer", background: "#f8fafc", color: "#475569", fontWeight: "700", fontSize: "13px", transition: "0.2s" },
  
  table: { width: "100%", borderCollapse: "collapse", border: "1px solid #cbd5e1" },
  tableHead: { textAlign: "left", background: "#f8fafc", borderBottom: "2px solid #1e3a8a" },
  th: { padding: "16px 20px", fontSize: "12px", color: "#1e3a8a", textTransform: "uppercase", fontWeight: "800" },
  tableRow: { borderBottom: "1px solid #e2e8f0" },
  td: { padding: "25px 20px", verticalAlign: "top" },
  roomName: { fontWeight: "800", color: "#0f172a", fontSize: "14px", marginBottom: "12px" },
  roomStat: { fontSize: "12px", color: "#64748b", marginBottom: "4px" },
  roomAvai: { fontSize: "12px", fontWeight: "700", color: "#1e3a8a", padding: "6px 10px", background: "#f1f5f9", border: "1px solid #cbd5e1", display: "inline-block", marginTop: "4px" },
  priceOld: { fontSize: "13px", color: "#94a3b8", textDecoration: "line-through" },
  priceNew: { fontSize: "22px", fontWeight: "800", color: "#0f172a", margin: "6px 0" },
  priceDiff: { fontSize: "12px", fontWeight: "700" },
  ul: { paddingLeft: "15px", margin: 0, fontSize: "13px", color: "#334155", lineHeight: "1.7" },
  tdAncillary: { padding: "25px 20px", verticalAlign: "top", fontSize: "13px", fontWeight: "700", color: "#1e3a8a", lineHeight: "1.6" },
  
  impactSection: { border: "1px solid #cbd5e1", background: "white", overflow: "hidden" },
  impactHeader: { fontSize: "15px", fontWeight: "800", color: "#0f172a", background: "#f1f5f9", margin: 0, padding: "20px 25px", textTransform: "uppercase", borderBottom: "1px solid #e2e8f0" },
  impactGrid: { padding: "40px", display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "40px" },
  impactTextCol: { borderRight: "1px solid #e2e8f0", paddingRight: "40px" },
  impactDesc: { fontSize: "14px", color: "#475569", lineHeight: "1.8", margin: "0 0 25px 0" },
  impactBaseBox: { padding: "20px", background: "#f1f5f9", border: "1px solid #cbd5e1" },
  impactBaseLabel: { fontSize: "12px", fontWeight: "700", color: "#64748b", marginBottom: "5px" },
  impactBaseVal: { fontSize: "24px", fontWeight: "800", color: "#0f172a" },
  impactResultGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" },
  impactTotalBox: { padding: "20px", background: "#0f172a", color: "white", gridColumn: "1 / -1", borderLeft: "4px solid #1e3a8a" },
  impactTotalLabel: { fontSize: "12px", fontWeight: "700", color: "#94a3b8", marginBottom: "5px" },
  impactTotalVal: { fontSize: "32px", fontWeight: "800", color: "white" },
  impactGrowthBox: { padding: "15px", background: "#f0fdf4", border: "1px solid #bbf7d0" },
  impactSubBox: { padding: "15px", background: "white", border: "1px solid #cbd5e1" },
  impactAncilBox: { padding: "15px", background: "white", border: "1px solid #cbd5e1", gridColumn: "1 / -1" }
};
const tdStyle = { padding: "25px 20px", verticalAlign: "top" };