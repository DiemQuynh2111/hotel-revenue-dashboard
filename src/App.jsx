import React, { useState, useMemo } from "react";
import * as XLSX from "xlsx";

// 1. FORMAT TIỀN TỆ & SỐ
function currency(v) {
  const num = Number(v);
  if (isNaN(num)) return "$0";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(num);
}
function formatNumber(v) {
  return new Intl.NumberFormat("en-US").format(Math.round(v));
}

// 2. GIẢI MÃ EXCEL
const readExcel = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: "array", cellDates: true });
        resolve(workbook);
      } catch (err) { reject(new Error("Lỗi đọc file Excel")); }
    };
    reader.readAsArrayBuffer(file);
  });
};

function isWeekend(dateVal) {
  if (!dateVal) return false;
  let d = dateVal instanceof Date ? dateVal : new Date(dateVal);
  if (isNaN(d.getTime())) return false;
  const day = d.getDay();
  return day === 5 || day === 6;
}

export default function App() {
  const [historyFile, setHistoryFile] = useState(null);
  const [forecastFile, setForecastFile] = useState(null);
  const [appData, setAppData] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // States Điều khiển Báo cáo
  const [selectedDayType, setSelectedDayType] = useState("Weekday");
  const [simLeadTime, setSimLeadTime] = useState(15); 
  const [targetOccupancy, setTargetOccupancy] = useState(60); // Mục tiêu công suất (%)

  // DỮ LIỆU TỒN KHO TRUNG BÌNH MỖI NGÀY (DAILY SNAPSHOT)
  const DAILY_CAPACITY = { RT_STD: 45, RT_DLX: 28, RT_STE: 7 };
  const TOTAL_DAILY_ROOMS = 80;
  
  // Dữ liệu đã bán (On-hand) trung bình mỗi ngày dựa trên mốc lịch sử 43%
  const DAILY_SOLD = { RT_STD: 19, RT_DLX: 12, RT_STE: 3 };
  const TOTAL_DAILY_SOLD = 34; // Tương đương 42.5% Occupancy
  
  // Tồn kho cơ sở trống mỗi ngày
  const DAILY_AVAI = { 
    RT_STD: DAILY_CAPACITY.RT_STD - DAILY_SOLD.RT_STD,
    RT_DLX: DAILY_CAPACITY.RT_DLX - DAILY_SOLD.RT_DLX,
    RT_STE: DAILY_CAPACITY.RT_STE - DAILY_SOLD.RT_STE
  };

  const handleProcessData = async () => {
    if (!historyFile || !forecastFile) return alert("Vui lòng tải lên đủ 2 file dữ liệu.");
    setIsProcessing(true);

    try {
      const [histWb, forecastWb] = await Promise.all([readExcel(historyFile), readExcel(forecastFile)]);

      // ĐỌC FILE DỰ BÁO (BASELINE)
      const summarySheet = forecastWb.SheetNames.find(n => n.toLowerCase().includes("summary")) || forecastWb.SheetNames[0];
      const summaryData = XLSX.utils.sheet_to_json(forecastWb.Sheets[summarySheet]);
      const metrics = {};
      summaryData.forEach(row => {
        const key = row.metric || row.Metric || Object.values(row)[0];
        const val = row.value || row.Value || Object.values(row)[1];
        metrics[String(key).trim()] = parseFloat(val) || 0;
      });

      const forecastTotal = metrics["Forecast Total Revenue"] || 125494;
      const onHandTotal = metrics["On-hand Total Revenue"] || 110744;

      // ĐỌC FILE LỊCH SỬ (TÍNH TOÁN GIÁ BASE)
      const folioSheet = histWb.SheetNames.find(n => n.toLowerCase().includes("folio")) || histWb.SheetNames[0];
      const resSheet = histWb.SheetNames.find(n => n.toLowerCase().includes("reservation")) || histWb.SheetNames[1];
      const folios = XLSX.utils.sheet_to_json(histWb.Sheets[folioSheet]);
      const reservations = XLSX.utils.sheet_to_json(histWb.Sheets[resSheet]);

      const resP002 = reservations.filter(r => r.property_id === "P002");
      const foliosP002 = folios.filter(f => f.property_id === "P002");

      const resMap = {};
      resP002.forEach(r => { resMap[r.reservation_id] = { roomType: r.room_type_id, segment: r.segment }; });

      const stats = {
        Weekday: { RT_STD: { sum: 0, count: 0 }, RT_DLX: { sum: 0, count: 0 }, RT_STE: { sum: 0, count: 0 } },
        Weekend: { RT_STD: { sum: 0, count: 0 }, RT_DLX: { sum: 0, count: 0 }, RT_STE: { sum: 0, count: 0 } }
      };
      
      let historicalRoomNet = 0;
      let historicalAncillaryNet = 0;

      foliosP002.forEach(f => {
        const resInfo = resMap[f.reservation_id];
        const amt = parseFloat(f.amount_net || 0);
        if (!resInfo || !amt) return;

        if (f.charge_category === "Room") {
          historicalRoomNet += amt;
          const dt = isWeekend(f.posting_date) ? "Weekend" : "Weekday";
          if (stats[dt] && stats[dt][resInfo.roomType]) { stats[dt][resInfo.roomType].sum += amt; stats[dt][resInfo.roomType].count += 1; }
        } else {
          historicalAncillaryNet += amt;
        }
      });

      const historicalAncillaryRatio = historicalAncillaryNet / (historicalRoomNet || 1);

      // KÊ TOA CHIẾN LƯỢC
      const strategies = {
        Weekday: {
          RT_STD: {
            name: "HẠNG TIÊU CHUẨN (STANDARD)",
            oldPrice: (stats.Weekday.RT_STD.sum / (stats.Weekday.RT_STD.count || 1)) || 92,
            targetRatio: 0.6,
            who: [
              "Ưu tiên 1 - Phân khúc Corporate: Tạo nền tảng công suất ngày thường ổn định, giảm tỷ trọng Leisure rủi ro.",
              "Ưu tiên 2 - Phân khúc Group: Khai thác đoàn khách lưu trú dài ngày (>6 đêm) để tối ưu hóa chi tiêu F&B/Giặt ủi."
            ],
            where: [
              "Kênh 1 - Direct B2B Contract: Miễn phí hoa hồng OTA, không bào mòn giá trị ròng (Net ADR).",
              "Kênh 2 - OTA: Chỉ dùng để giải phóng tồn kho phút chót (Last-minute booking)."
            ],
            ancillary: "MICE Bundle (Dịch vụ F&B + Laundry)"
          },
          RT_DLX: {
            name: "HẠNG CAO CẤP (DELUXE)",
            oldPrice: (stats.Weekday.RT_DLX.sum / (stats.Weekday.RT_DLX.count || 1)) || 131,
            targetRatio: 0.5,
            who: [
              "Ưu tiên 1 - Phân khúc Leisure: Tệp khách mang lại ADR cao nhất, là nguồn thu chủ lực giữa tuần.",
              "Ưu tiên 2 - Phân khúc MICE: Tận dụng các đoàn sự kiện doanh nghiệp quy mô nhỏ, có ngân sách tốt."
            ],
            where: [
              "Kênh 1 - Direct Website: Chuyển dịch khách từ OTA về Web để kiểm soát rủi ro hủy phòng ảo (OTA hiện hủy tới 17.8%)."
            ],
            ancillary: "Spa & Tour Bundle (Phá vỡ thế độc tôn của F&B)"
          },
          RT_STE: {
            name: "HẠNG VIP (SUITE)",
            oldPrice: (stats.Weekday.RT_STE.sum / (stats.Weekday.RT_STE.count || 1)) || 215,
            targetRatio: 0.7,
            who: [
              "Ưu tiên 1 - Phân khúc MICE VIPs: Chuyên gia, quản lý cấp cao tham gia sự kiện giữa tuần."
            ],
            where: [
              "Kênh 1 - Direct Phone / GDS: Tuyệt đối không bán Suite qua OTA để giữ hình ảnh thương hiệu và chặn Leakage."
            ],
            ancillary: "Luxury Service Bundle (All-inclusive)"
          }
        },
        Weekend: {
          RT_STD: {
            name: "HẠNG TIÊU CHUẨN (STANDARD)",
            oldPrice: (stats.Weekend.RT_STD.sum / (stats.Weekend.RT_STD.count || 1)) || 96,
            targetRatio: 0.8,
            who: [
              "Ưu tiên 1 - Phân khúc Leisure: Cầu du lịch tự túc cuối tuần cao, duy trì giá trị phòng tốt."
            ],
            where: [
              "Kênh 1 - OTA (Booking/Agoda): Kéo Volume mạnh nhưng bắt buộc áp dụng Non-refundable nếu đặt sớm.",
              "Kênh 2 - Direct Website: Khuyến mãi thành viên ẩn để kéo khách khỏi OTA."
            ],
            ancillary: "Buffet Bundle (Dịch vụ Ẩm thực cuối tuần)"
          },
          RT_DLX: {
            name: "HẠNG CAO CẤP (DELUXE)",
            oldPrice: (stats.Weekend.RT_DLX.sum / (stats.Weekend.RT_DLX.count || 1)) || 135,
            targetRatio: 0.6,
            who: [
              "Ưu tiên 1 - Leisure Couples: Sẵn sàng chi trả cao cho tiện ích nghỉ dưỡng cuối tuần."
            ],
            where: [
              "Kênh 1 - Direct Website: Chạy quảng cáo gói Combo Weekend Retreat để lấy Data khách hàng trực tiếp."
            ],
            ancillary: "Spa Retreat Package (Trải nghiệm làm đẹp)"
          },
          RT_STE: {
            name: "HẠNG VIP (SUITE)",
            oldPrice: (stats.Weekend.RT_STE.sum / (stats.Weekend.RT_STE.count || 1)) || 225,
            targetRatio: 0.9,
            who: [
              "Ưu tiên 1 - Leisure (VIP/Family): Dữ liệu lấp đầy Suite cuối tuần đạt 57.4% (cao nhất). Ưu tiên tuyệt đối khách cao cấp."
            ],
            where: [
              "Kênh 1 - Direct & Loyalty: Bảo vệ dòng tiền. Áp dụng Non-refundable 100% để triệt tiêu 130 case No-show."
            ],
            ancillary: "Premium Heritage Bundle (Đóng gói toàn bộ tiện ích)"
          }
        }
      };

      setAppData({ 
        metrics: { forecast: forecastTotal, onHand: onHandTotal }, 
        strategies, 
        historicalAncillaryRatio 
      });
      setIsProcessing(false);
    } catch (err) { alert("Lỗi hệ thống khi đọc File Excel."); setIsProcessing(false); }
  };

  // MÔ PHỎNG ĐỊNH GIÁ & MONTE CARLO
  const simulationData = useMemo(() => {
    if (!appData) return null;

    const targetDailyRooms = Math.round(TOTAL_DAILY_ROOMS * (targetOccupancy / 100));
    const extraDailyRoomsToSell = Math.max(0, targetDailyRooms - TOTAL_DAILY_SOLD);
    const extraMonthlyRoomsToSell = extraDailyRoomsToSell * 31; 

    // ĐỘNG CƠ ĐỊNH GIÁ ĐA TẦNG (MULTI-TIER DYNAMIC PRICING)
    let leadMultiplier = 1.0;
    let leadReason = "Mức giá Cân bằng (Base Rate). Tốc độ Pickup phòng duy trì ổn định.";

    if (simLeadTime <= 3) {
      leadMultiplier = 1.15; // Tăng 15%
      leadReason = "TẦNG 1 (Last-Minute): TĂNG GIÁ 15% (Yield Optimization). Khách đặt cận ngày có nhu cầu khẩn cấp, ít thời gian so sánh giá.";
    } else if (simLeadTime > 3 && simLeadTime <= 10) {
      leadMultiplier = 1.05; // Tăng 5%
      leadReason = "TẦNG 2 (Short-term): TĂNG GIÁ 5%. Khách hàng đã chốt lịch trình di chuyển, nhu cầu bắt đầu cứng lại.";
    } else if (simLeadTime > 10 && simLeadTime <= 20) {
      leadMultiplier = 1.00; // Giá Base
      leadReason = "TẦNG 3 (Standard): Giữ mức Giá Cân Bằng (Base Rate) để đảm bảo Tỷ lệ chuyển đổi tự nhiên.";
    } else if (simLeadTime > 20) {
      leadMultiplier = 0.90; // Giảm 10%
      leadReason = "TẦNG 4 (Early Bird): GIẢM GIÁ 10% (Volume Capture) nhằm lấy dòng tiền sớm. Bắt buộc áp dụng Không Hoàn Hủy để loại rủi ro.";
    }

    const inventoryDisplayFactor = 0.3 + 0.7 * (simLeadTime / 30); 

    const processedRooms = ["RT_STD", "RT_DLX", "RT_STE"].map(key => {
      const strat = appData.strategies[selectedDayType][key];
      const dynamicAvai = Math.round(DAILY_AVAI[key] * inventoryDisplayFactor);
      
      let dayMultiplier = selectedDayType === "Weekend" ? 1.05 : 1.0; 
      const dynamicAdr = strat.oldPrice * leadMultiplier * dayMultiplier;
      const priceDiff = ((dynamicAdr / strat.oldPrice) - 1) * 100;

      const targetRoomSell = Math.round(extraMonthlyRoomsToSell * strat.targetRatio * 0.4);

      return { key, avai: dynamicAvai, targetRoomSell, dynamicAdr, priceDiff, ...strat };
    });

    let successfulRoomRev = 0;
    
    for (let i = 0; i < 5000; i++) {
      const simulatedDemandCapture = 0.75 + Math.random() * 0.20;
      const simulatedCancelRatio = 0.08 + Math.random() * 0.05; 
      const conversionRate = simulatedDemandCapture * (1 - simulatedCancelRatio);
      const simulatedMonthlyRoomsSold = extraMonthlyRoomsToSell * conversionRate;
      const avgDynamicAdr = processedRooms.reduce((sum, r) => sum + r.dynamicAdr, 0) / 3;
      successfulRoomRev += (simulatedMonthlyRoomsSold * avgDynamicAdr);
    }

    const meanRoomRev = successfulRoomRev / 5000;
    const meanAncillaryRev = meanRoomRev * appData.historicalAncillaryRatio;
    const totalProjectedRev = appData.metrics.onHand + meanRoomRev + meanAncillaryRev;
    
    return { extraMonthlyRoomsToSell, leadReason, processedRooms, impact: { totalProjectedRev, meanRoomRev, meanAncillaryRev } };

  }, [appData, selectedDayType, simLeadTime, targetOccupancy]);

  if (!appData) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", position: "relative", padding: "20px", fontFamily: "system-ui" }}>
        <div style={{ position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", backgroundImage: "url('image_74fb96.jpg')", backgroundSize: "cover", backgroundPosition: "center", filter: "blur(12px)", opacity: 0.6, zIndex: -1 }} />
        
        <h1 style={{ color: "#1e3a8a", marginBottom: "30px", fontSize: "32px", fontWeight: "900", letterSpacing: "1px", background: "white", padding: "12px 30px", borderRadius: "8px", border: "1px solid #bfdbfe", boxShadow: "0 4px 6px rgba(0,0,0,0.1)" }}>HỆ THỐNG HOẠCH ĐỊNH DOANH THU (BI PRESCRIPTIVE)</h1>
        <div style={{ background: "rgba(255,255,255,0.95)", padding: "50px", borderRadius: "12px", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)", width: "100%", maxWidth: "800px", border: "1px solid #bfdbfe" }}>
          <div style={{ display: "flex", gap: "20px", marginBottom: "30px" }}>
            <div style={{ flex: 1, border: "2px dashed #3b82f6", padding: "30px 20px", borderRadius: "8px", background: "#eff6ff", textAlign: "center" }}>
              <p style={{ fontSize: "13px", fontWeight: "800", color: "#1e40af", marginBottom: "15px" }}>1. TẢI FILE DỮ LIỆU LỊCH SỬ</p>
              <input type="file" accept=".xlsx" onChange={(e) => setHistoryFile(e.target.files[0])} />
            </div>
            <div style={{ flex: 1, border: "2px dashed #3b82f6", padding: "30px 20px", borderRadius: "8px", background: "#eff6ff", textAlign: "center" }}>
              <p style={{ fontSize: "13px", fontWeight: "800", color: "#1e40af", marginBottom: "15px" }}>2. TẢI FILE DỰ BÁO (FORECAST)</p>
              <input type="file" accept=".xlsx" onChange={(e) => setForecastFile(e.target.files[0])} />
            </div>
          </div>
          <button onClick={handleProcessData} disabled={isProcessing} style={{ background: "#1e3a8a", color: "white", padding: "18px", borderRadius: "6px", border: "none", cursor: "pointer", fontWeight: "800", letterSpacing: "1px", width: "100%", fontSize: "16px", transition: "0.2s" }}>
            {isProcessing ? "ĐANG XỬ LÝ MÔ HÌNH MONTE CARLO..." : "CHẨN ĐOÁN & XUẤT BÁO CÁO CHIẾN LƯỢC"}
          </button>
        </div>
      </div>
    );
  }

  const { extraMonthlyRoomsToSell, leadReason, processedRooms, impact } = simulationData;
  const growthPercent = ((impact.totalProjectedRev / appData.metrics.forecast) - 1) * 100;

  return (
    <div style={{ minHeight: "100vh", padding: "40px", fontFamily: "system-ui, sans-serif", color: "#0f172a", position: "relative" }}>
       <div style={{ position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", backgroundImage: "url('image_74fb96.jpg')", backgroundSize: "cover", backgroundPosition: "center", filter: "blur(15px)", opacity: 0.3, zIndex: -1 }} />
      
      <div style={{ maxWidth: "1400px", margin: "0 auto", background: "white", borderRadius: "12px", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)", overflow: "hidden", border: "1px solid #bfdbfe" }}>
        
        {/* HEADER SECTION */}
        <header style={{ background: "#eff6ff", padding: "30px 40px", borderBottom: "1px solid #bfdbfe" }}>
          <h1 style={{ fontSize: "26px", fontWeight: "900", color: "#1e3a8a", textTransform: "uppercase", margin: "0 0 10px 0" }}>Báo cáo Kê toa Tối ưu Doanh thu Tháng 01/2026</h1>
          <p style={{ margin: 0, color: "#1d4ed8", fontSize: "14px", fontWeight: "600" }}>Ứng dụng Định giá động & Mô phỏng rủi ro Monte Carlo (Monte Carlo Simulation)</p>
        </header>

        <div style={{ padding: "40px" }}>
          
          {/* TOP METRICS */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginBottom: "40px" }}>
            <div style={{ padding: "24px", border: "1px solid #bfdbfe", borderRadius: "8px", background: "#eff6ff" }}>
              <span style={{ fontSize: "12px", color: "#1d4ed8", fontWeight: "800" }}>DOANH THU ĐÃ CHỐT TỪ ĐẦU THÁNG (ON-HAND)</span>
              <div style={{ fontSize: "32px", fontWeight: "900", color: "#1e3a8a", marginTop: "10px" }}>{currency(appData.metrics.onHand)}</div>
            </div>
            <div style={{ padding: "24px", border: "1px solid #cbd5e1", borderRadius: "8px", background: "white" }}>
              <span style={{ fontSize: "12px", color: "#475569", fontWeight: "800" }}>DỰ BÁO DOANH THU TĨNH (BASELINE FORECAST)</span>
              <div style={{ fontSize: "32px", fontWeight: "900", color: "#0f172a", marginTop: "10px" }}>{currency(appData.metrics.forecast)}</div>
            </div>
          </div>

          {/* DYNAMIC CONTROLS (THEME XANH BIỂN) */}
          <section style={{ marginBottom: "30px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "40px", padding: "35px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #cbd5e1" }}>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px" }}>
                <h2 style={{ fontSize: "15px", fontWeight: "800", color: "#0f172a", margin: 0 }}>MỤC TIÊU CÔNG SUẤT BÁN PHÒNG (TARGET OCCUPANCY):</h2>
                <span style={{ fontSize: "18px", fontWeight: "900", color: "white", background: "#2563eb", padding: "6px 15px", borderRadius: "4px" }}>{targetOccupancy}%</span>
              </div>
              <input type="range" min="43" max="95" value={targetOccupancy} onChange={(e) => setTargetOccupancy(Number(e.target.value))} style={{ width: "100%", accentColor: "#2563eb", cursor: "pointer", height: "8px" }} />
              <div style={{ marginTop: "15px", fontSize: "14px", color: "#334155" }}>
                Công suất trung bình Lịch sử: <strong>43%</strong>. Thuật toán tự động tính toán dư địa cần lấp đầy để đạt mốc {targetOccupancy}% là: <strong style={{color:"#1d4ed8"}}>{formatNumber(extraMonthlyRoomsToSell)} phòng/tháng</strong>.
              </div>
            </div>

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px" }}>
                <h2 style={{ fontSize: "15px", fontWeight: "800", color: "#0f172a", margin: 0 }}>ĐIỀU CHỈNH KHOẢNG CÁCH ĐẶT PHÒNG (LEAD TIME):</h2>
                <span style={{ fontSize: "18px", fontWeight: "900", color: "white", background: "#2563eb", padding: "6px 15px", borderRadius: "4px" }}>{simLeadTime} NGÀY</span>
              </div>
              <input type="range" min="1" max="30" value={simLeadTime} onChange={(e) => setSimLeadTime(Number(e.target.value))} style={{ width: "100%", accentColor: "#2563eb", cursor: "pointer", height: "8px" }} />
              <div style={{ marginTop: "15px", fontSize: "14px", color: "#334155", lineHeight: "1.6", borderLeft: "4px solid #93c5fd", paddingLeft: "15px" }}>
                <strong style={{color:"#0f172a"}}>Phản ứng Định giá:</strong> {leadReason}
              </div>
            </div>
          </section>

          {/* TAB CHỌN DAY TYPE */}
          <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
            <button onClick={() => setSelectedDayType("Weekday")} style={tabStyle(selectedDayType === "Weekday")}>BỐI CẢNH DỮ LIỆU: NGÀY TRONG TUẦN (WEEKDAY)</button>
            <button onClick={() => setSelectedDayType("Weekend")} style={tabStyle(selectedDayType === "Weekend")}>BỐI CẢNH DỮ LIỆU: CUỐI TUẦN (WEEKEND)</button>
          </div>

          {/* BẢNG KÊ TOA CHIẾN LƯỢC */}
          <section style={{ marginBottom: "50px" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", border: "1px solid #bfdbfe" }}>
              <thead>
                <tr style={{ textAlign: "left", background: "#1e3a8a", color: "white" }}>
                  <th style={thStyle}>LOẠI PHÒNG (TRUNG BÌNH MỖI NGÀY)</th>
                  <th style={thStyle}>ĐỊNH GIÁ THEO LEAD TIME</th>
                  <th style={thStyle}>CHIẾN LƯỢC: BÁN CHO AI?</th>
                  <th style={thStyle}>CHIẾN LƯỢC: BÁN KÊNH GÌ?</th>
                  <th style={thStyle}>DỊCH VỤ BÁN KÈM (BUNDLE)</th>
                </tr>
              </thead>
              <tbody style={{ background: "white" }}>
                {processedRooms.map(room => (
                  <tr key={room.key} style={{ borderBottom: "1px solid #e2e8f0" }}>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: "800", color: "#1e3a8a", fontSize: "15px", marginBottom: "10px" }}>{room.name}</div>
                      <div style={{ fontSize: "12px", color: "#475569" }}>Sức chứa (Capacity): {formatNumber(DAILY_CAPACITY[room.key])}</div>
                      <div style={{ fontSize: "12px", color: "#475569" }}>Đã bán (On-hand): {formatNumber(DAILY_SOLD[room.key])}</div>
                      <div style={{ fontSize: "13px", fontWeight: "800", color: "#1d4ed8", marginTop: "5px", padding: "6px", background: "#eff6ff", border: "1px solid #bfdbfe", display: "inline-block", borderRadius: "4px" }}>
                        Tồn kho mở bán: {formatNumber(room.avai)}
                      </div>
                    </td>
                    <td style={tdStyle}>
                      <div style={{ fontSize: "14px", color: "#64748b", textDecoration: "line-through" }}>{currency(room.oldPrice)}</div>
                      <div style={{ fontSize: "22px", fontWeight: "900", color: "#0f172a", margin: "6px 0" }}>{currency(room.dynamicAdr)}</div>
                      <div style={{ fontSize: "13px", fontWeight: "800", color: room.priceDiff >= 0 ? "#059669" : "#dc2626" }}>({room.priceDiff >= 0 ? "+" : ""}{room.priceDiff.toFixed(1)}%)</div>
                    </td>
                    <td style={tdStyle}>
                      <ul style={{ paddingLeft: "15px", margin: 0, fontSize: "13px", color: "#334155", lineHeight: "1.7" }}>
                        {room.who.map((w, idx) => (
                          <li key={idx} style={{ marginBottom: "8px" }}>{w}</li>
                        ))}
                      </ul>
                    </td>
                    <td style={tdStyle}>
                      <ul style={{ paddingLeft: "15px", margin: 0, fontSize: "13px", color: "#334155", lineHeight: "1.7" }}>
                        {room.where.map((w, idx) => (
                          <li key={idx} style={{ marginBottom: "8px" }}>{w}</li>
                        ))}
                      </ul>
                    </td>
                    <td style={{ ...tdStyle, fontSize: "14px", fontWeight: "800", color: "#2563eb", lineHeight: "1.6" }}>
                      {room.ancillary}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* KẾT QUẢ ĐẠT ĐƯỢC (MONTE CARLO) */}
          <section style={{ border: "1px solid #cbd5e1", background: "white", borderRadius: "8px", overflow: "hidden" }}>
            <h2 style={{ fontSize: "18px", fontWeight: "900", color: "#ffffff", background: "#1e3a8a", margin: 0, padding: "20px 25px" }}>KẾT QUẢ ĐẠT ĐƯỢC KỲ VỌNG TỪ MÔ HÌNH MONTE CARLO</h2>
            <div style={{ padding: "40px", display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "40px" }}>
              
              <div style={{ borderRight: "1px solid #e2e8f0", paddingRight: "40px" }}>
                <p style={{ fontSize: "15px", color: "#334155", lineHeight: "1.8", margin: "0 0 25px 0" }}>
                  Hệ thống thực hiện chạy <strong>5000 kịch bản ngẫu nhiên</strong> dựa trên các rủi ro: Lực cầu thị trường biến động (75% - 95%) và Tỷ lệ hủy phòng ảo trên kênh OTA (siết từ 17.8% xuống 8%-13%).
                  <br/><br/>
                  Bằng việc áp dụng <strong>Định giá động theo Lead Time</strong> để lấp đầy Công suất mục tiêu <strong>{targetOccupancy}%</strong>, khách sạn hoàn toàn có thể phá vỡ ngưỡng dự báo tĩnh, tạo ra sự tăng trưởng thực chất trên cả Doanh thu phòng và Dịch vụ bổ trợ.
                </p>
                <div style={{ display: "flex", gap: "20px" }}>
                  <div style={{ flex: 1, padding: "20px", background: "#f8fafc", border: "1px solid #cbd5e1", borderRadius: "8px" }}>
                    <div style={{ fontSize: "12px", fontWeight: "800", color: "#475569", marginBottom: "5px" }}>DỰ BÁO TĨNH (BASELINE)</div>
                    <div style={{ fontSize: "28px", fontWeight: "900", color: "#0f172a" }}>{currency(appData.metrics.forecast)}</div>
                  </div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
                <div style={{ padding: "20px", background: "#eff6ff", border: "2px solid #2563eb", borderRadius: "8px", gridColumn: "1 / -1" }}>
                  <div style={{ fontSize: "12px", fontWeight: "800", color: "#1d4ed8", marginBottom: "5px" }}>TỔNG DOANH THU MỚI KỲ VỌNG ĐẠT ĐƯỢC</div>
                  <div style={{ fontSize: "36px", fontWeight: "900", color: "#1e3a8a" }}>{currency(impact.totalProjectedRev)}</div>
                </div>
                <div style={{ padding: "15px", background: "#f0fdf4", border: "1px solid #86efac", borderRadius: "6px" }}>
                  <div style={{ fontSize: "11px", fontWeight: "800", color: "#059669", marginBottom: "5px" }}>TĂNG TRƯỞNG</div>
                  <div style={{ fontSize: "24px", fontWeight: "900", color: "#059669" }}>+{growthPercent.toFixed(1)}%</div>
                </div>
                <div style={{ padding: "15px", background: "white", border: "1px solid #e2e8f0", borderRadius: "6px" }}>
                  <div style={{ fontSize: "11px", fontWeight: "800", color: "#475569", marginBottom: "5px" }}>DOANH THU PHÒNG TĂNG</div>
                  <div style={{ fontSize: "20px", fontWeight: "900", color: "#0f172a" }}>+{currency(impact.meanRoomRev)}</div>
                </div>
                <div style={{ padding: "15px", background: "white", border: "1px solid #e2e8f0", borderRadius: "6px", gridColumn: "1 / -1" }}>
                  <div style={{ fontSize: "11px", fontWeight: "800", color: "#475569", marginBottom: "5px" }}>DOANH THU DỊCH VỤ ĐI KÈM TĂNG THÊM</div>
                  <div style={{ fontSize: "20px", fontWeight: "900", color: "#2563eb" }}>+{currency(impact.meanAncillaryRev)}</div>
                </div>
              </div>

            </div>
          </section>

        </div>
      </div>
    </div>
  );
}

const tabStyle = (active) => ({
  flex: 1, padding: "18px", border: "1px solid #bfdbfe", cursor: "pointer", 
  background: active ? "#1e3a8a" : "white", 
  color: active ? "white" : "#1e40af", fontWeight: "800", fontSize: "14px",
  letterSpacing: "0.5px", transition: "all 0.2s ease", borderRadius: "4px"
});
const thStyle = { padding: "18px 20px", fontSize: "12px", color: "#bfdbfe", textTransform: "uppercase", fontWeight: "800" };
const tdStyle = { padding: "24px 20px", verticalAlign: "top" };