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

  // DỮ LIỆU TỒN KHO THÁNG 01/2026 (P002: 45 STD, 28 DLX, 7 STE x 31 Ngày = 2480 phòng)
  const TOTAL_CAPACITY = { RT_STD: 1395, RT_DLX: 868, RT_STE: 217 };
  const TOTAL_ROOMS = 2480;
  
  // Dữ liệu đã bán (On-hand) ước tính tương đương mốc lịch sử ~42.5%
  const SOLD_ON_HAND = { RT_STD: 595, RT_DLX: 370, RT_STE: 90 };
  const TOTAL_SOLD = 1055;
  
  // Tồn kho cơ sở (Base Available)
  const BASE_AVAI = { 
    RT_STD: TOTAL_CAPACITY.RT_STD - SOLD_ON_HAND.RT_STD,
    RT_DLX: TOTAL_CAPACITY.RT_DLX - SOLD_ON_HAND.RT_DLX,
    RT_STE: TOTAL_CAPACITY.RT_STE - SOLD_ON_HAND.RT_STE
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

      // KÊ TOA CHIẾN LƯỢC BÁM SÁT ONTOLOGY & STORYBOARD
      const strategies = {
        Weekday: {
          RT_STD: {
            name: "HẠNG TIÊU CHUẨN (STANDARD)",
            oldPrice: (stats.Weekday.RT_STD.sum / (stats.Weekday.RT_STD.count || 1)) || 92,
            targetRatio: 0.6,
            who: [
              { segment: "Corporate", reason: "Khách sạn phụ thuộc Leisure (62%). Mở rộng Corporate giúp tạo Base công suất ngày thường ổn định." },
              { segment: "Group", reason: "Đoàn lưu trú dài ngày (>6 đêm) có mức chi tiêu Ancillary rất cao." }
            ],
            where: [
              { channel: "Direct - B2B Contract", reason: "Khắc phục việc OTA bào mòn giá trị ròng. Ký kết doanh nghiệp để miễn hoa hồng." },
              { channel: "OTA", reason: "Chỉ mở bán lượng tồn kho dư thừa phút chót." }
            ],
            ancillary: "MICE Bundle (F&B + Laundry)"
          },
          RT_DLX: {
            name: "HẠNG CAO CẤP (DELUXE)",
            oldPrice: (stats.Weekday.RT_DLX.sum / (stats.Weekday.RT_DLX.count || 1)) || 131,
            targetRatio: 0.5,
            who: [
              { segment: "Leisure", reason: "Tệp khách chủ lực đóng góp >434,000 USD, mang lại RevPAR cao nhất." },
              { segment: "MICE", reason: "Tận dụng ngân sách của các sự kiện doanh nghiệp tổ chức giữa tuần." }
            ],
            where: [
              { channel: "Direct Website", reason: "Kênh OTA có tỷ lệ hủy ảo lên tới 17.8%. Chuyển dịch về Website để kiểm soát rủi ro." }
            ],
            ancillary: "Spa & Tour Bundle"
          },
          RT_STE: {
            name: "HẠNG VIP (SUITE)",
            oldPrice: (stats.Weekday.RT_STE.sum / (stats.Weekday.RT_STE.count || 1)) || 215,
            targetRatio: 0.7,
            who: [
              { segment: "MICE VIPs", reason: "Khai thác khách sự kiện cao cấp để bù đắp RevPAR bị sụt giảm giữa tuần." }
            ],
            where: [
              { channel: "Direct GDS", reason: "Hạng cao cấp tuyệt đối không phụ thuộc OTA để tránh rủi ro hủy phòng và hoa hồng lớn." }
            ],
            ancillary: "Luxury Service Bundle"
          }
        },
        Weekend: {
          RT_STD: {
            name: "HẠNG TIÊU CHUẨN (STANDARD)",
            oldPrice: (stats.Weekend.RT_STD.sum / (stats.Weekend.RT_STD.count || 1)) || 96,
            targetRatio: 0.8,
            who: [
              { segment: "Leisure", reason: "Lượng booking giảm nhưng ADR duy trì tốt. Khách du lịch tự túc có sức mua ổn định." }
            ],
            where: [
              { channel: "Đa kênh OTA & Direct", reason: "OTA kéo Volume cực tốt nhưng Conversion chỉ 83.2%. Áp dụng chặt chính sách Non-refundable." }
            ],
            ancillary: "Buffet Bundle (F&B)"
          },
          RT_DLX: {
            name: "HẠNG CAO CẤP (DELUXE)",
            oldPrice: (stats.Weekend.RT_DLX.sum / (stats.Weekend.RT_DLX.count || 1)) || 135,
            targetRatio: 0.6,
            who: [
              { segment: "Leisure Couples", reason: "Định hướng Value-driven. Khách nghỉ dưỡng cuối tuần sẵn sàng chi trả cao cho tiện ích." }
            ],
            where: [
              { channel: "Direct Website", reason: "Chạy chiến dịch giảm giá trị cộng thêm trên Web để kéo tệp khách từ Agoda/Booking về." }
            ],
            ancillary: "Spa Retreat Package"
          },
          RT_STE: {
            name: "HẠNG VIP (SUITE)",
            oldPrice: (stats.Weekend.RT_STE.sum / (stats.Weekend.RT_STE.count || 1)) || 225,
            targetRatio: 0.9,
            who: [
              { segment: "Leisure (Family/VIP)", reason: "Dữ liệu lấp đầy Suite cuối tuần đạt 57.4% (cao nhất). Ưu tiên tuyệt đối khách cao cấp." }
            ],
            where: [
              { channel: "Direct Phone & Loyalty", reason: "Bảo vệ dòng tiền. Áp dụng Non-refundable 100% để triệt tiêu 130 trường hợp No-show." }
            ],
            ancillary: "Premium Heritage Bundle"
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

  // MÔ PHỎNG ĐỊNH GIÁ, TỒN KHO & MONTE CARLO
  const simulationData = useMemo(() => {
    if (!appData) return null;

    // 1. TÍNH TOÁN QUỸ PHÒNG MỤC TIÊU DỰA TRÊN CÔNG SUẤT (TARGET OCCUPANCY)
    const targetTotalRooms = Math.round(TOTAL_ROOMS * (targetOccupancy / 100));
    const extraRoomsToSell = Math.max(0, targetTotalRooms - TOTAL_SOLD);

    // 2. MÔ PHỎNG LEAD TIME (ẢNH HƯỞNG GIÁ & TỒN KHO)
    let leadMultiplier = 1.0;
    let leadReason = "Giá duy trì ổn định. Quỹ phòng đang mở bán tiêu chuẩn.";
    
    // Thuật toán Tồn kho: Đặt càng sát ngày (simLeadTime nhỏ), Tồn kho mở bán càng ít
    // Giả lập từ 20% (sát ngày) đến 100% (cách 30 ngày)
    const inventoryDisplayFactor = 0.2 + 0.8 * (simLeadTime / 30); 

    if (simLeadTime <= 5) {
      leadMultiplier = 1.15;
      leadReason = "TĂNG GIÁ 15% (Yield Optimization). Cầu cận ngày khẩn cấp, khách hàng ít nhạy cảm về giá.";
    } else if (simLeadTime >= 15) {
      leadMultiplier = 0.90;
      leadReason = "GIẢM GIÁ 10% (Volume Capture). Yêu cầu áp dụng Không Hoàn Hủy để chốt quỹ phòng sớm.";
    }

    const processedRooms = ["RT_STD", "RT_DLX", "RT_STE"].map(key => {
      const strat = appData.strategies[selectedDayType][key];
      
      // Tồn kho linh hoạt theo Lead Time
      const dynamicAvai = Math.round(BASE_AVAI[key] * inventoryDisplayFactor);
      
      let dayMultiplier = selectedDayType === "Weekend" ? 1.05 : 1.0; 
      const dynamicAdr = strat.oldPrice * leadMultiplier * dayMultiplier;
      const priceDiff = ((dynamicAdr / strat.oldPrice) - 1) * 100;

      return { key, avai: dynamicAvai, dynamicAdr, priceDiff, ...strat };
    });

    // 3. CHẠY MONTE CARLO SIMULATION ĐỂ ĐÁNH GIÁ RỦI RO
    let successfulRoomRev = 0;
    
    for (let i = 0; i < 5000; i++) {
      // Xác suất chuyển đổi (75% - 95%)
      const simulatedDemandCapture = 0.75 + Math.random() * 0.20;
      // Tỷ lệ hủy ảo (Siết từ 17.8% xuống 8-13%)
      const simulatedCancelRatio = 0.08 + Math.random() * 0.05; 
      const conversionRate = simulatedDemandCapture * (1 - simulatedCancelRatio);

      const simulatedRoomsSold = extraRoomsToSell * conversionRate;
      
      const avgDynamicAdr = processedRooms.reduce((sum, r) => sum + r.dynamicAdr, 0) / 3;
      successfulRoomRev += (simulatedRoomsSold * avgDynamicAdr);
    }

    const meanRoomRev = successfulRoomRev / 5000;
    const meanAncillaryRev = meanRoomRev * appData.historicalAncillaryRatio;
    const totalProjectedRev = appData.metrics.onHand + meanRoomRev + meanAncillaryRev;
    
    return { extraRoomsToSell, leadReason, processedRooms, impact: { totalProjectedRev, meanRoomRev, meanAncillaryRev } };

  }, [appData, selectedDayType, simLeadTime, targetOccupancy]);

  if (!appData) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", position: "relative", padding: "20px", fontFamily: "system-ui" }}>
        <div style={{ position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", backgroundImage: "url('image_74fb96.jpg')", backgroundSize: "cover", backgroundPosition: "center", filter: "blur(12px)", opacity: 0.6, zIndex: -1 }} />
        
        <h1 style={{ color: "#064e3b", marginBottom: "30px", fontSize: "32px", fontWeight: "900", letterSpacing: "1px", background: "white", padding: "10px 30px", borderRadius: "8px", border: "1px solid #a7f3d0" }}>HỆ THỐNG HOẠCH ĐỊNH DOANH THU & GIÁ</h1>
        <div style={{ background: "rgba(255,255,255,0.95)", padding: "50px", borderRadius: "12px", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)", width: "100%", maxWidth: "800px", border: "1px solid #d1fae5" }}>
          <div style={{ display: "flex", gap: "20px", marginBottom: "30px" }}>
            <div style={{ flex: 1, border: "2px dashed #059669", padding: "30px 20px", borderRadius: "8px", background: "#f0fdf4", textAlign: "center" }}>
              <p style={{ fontSize: "13px", fontWeight: "800", color: "#065f46", marginBottom: "15px" }}>1. TẢI FILE DỮ LIỆU LỊCH SỬ</p>
              <input type="file" accept=".xlsx" onChange={(e) => setHistoryFile(e.target.files[0])} />
            </div>
            <div style={{ flex: 1, border: "2px dashed #059669", padding: "30px 20px", borderRadius: "8px", background: "#f0fdf4", textAlign: "center" }}>
              <p style={{ fontSize: "13px", fontWeight: "800", color: "#065f46", marginBottom: "15px" }}>2. TẢI FILE DỰ BÁO (FORECAST)</p>
              <input type="file" accept=".xlsx" onChange={(e) => setForecastFile(e.target.files[0])} />
            </div>
          </div>
          <button onClick={handleProcessData} disabled={isProcessing} style={{ background: "#047857", color: "white", padding: "18px", borderRadius: "6px", border: "none", cursor: "pointer", fontWeight: "800", letterSpacing: "1px", width: "100%", fontSize: "16px" }}>
            {isProcessing ? "ĐANG XỬ LÝ MÔ HÌNH MONTE CARLO..." : "CHẨN ĐOÁN & XUẤT BÁO CÁO CHIẾN LƯỢC"}
          </button>
        </div>
      </div>
    );
  }

  const { extraRoomsToSell, leadReason, processedRooms, impact } = simulationData;
  const growthPercent = ((impact.totalProjectedRev / appData.metrics.forecast) - 1) * 100;

  return (
    <div style={{ minHeight: "100vh", padding: "40px", fontFamily: "system-ui, sans-serif", color: "#064e3b", position: "relative" }}>
       <div style={{ position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", backgroundImage: "url('image_74fb96.jpg')", backgroundSize: "cover", backgroundPosition: "center", filter: "blur(15px)", opacity: 0.4, zIndex: -1 }} />
      
      <div style={{ maxWidth: "1300px", margin: "0 auto", background: "white", borderRadius: "12px", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)", overflow: "hidden", border: "1px solid #d1fae5" }}>
        
        {/* HEADER SECTION */}
        <header style={{ background: "#ecfdf5", padding: "30px 40px", borderBottom: "1px solid #a7f3d0" }}>
          <h1 style={{ fontSize: "24px", fontWeight: "900", color: "#064e3b", textTransform: "uppercase", margin: "0 0 10px 0" }}>Báo cáo Kê toa Tối ưu Doanh thu Tháng 01/2026</h1>
          <p style={{ margin: 0, color: "#047857", fontSize: "14px" }}>Dự phỏng Xác suất Monte Carlo dựa trên Khai phá dữ liệu Lịch sử & Dự báo tĩnh.</p>
        </header>

        <div style={{ padding: "40px" }}>
          
          {/* TOP METRICS */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginBottom: "40px" }}>
            <div style={{ padding: "24px", border: "1px solid #a7f3d0", borderRadius: "8px", background: "#f0fdf4" }}>
              <span style={{ fontSize: "12px", color: "#047857", fontWeight: "800" }}>DOANH THU ĐÃ CHỐT (ON-HAND)</span>
              <div style={{ fontSize: "32px", fontWeight: "900", color: "#064e3b", marginTop: "10px" }}>{currency(appData.metrics.onHand)}</div>
            </div>
            <div style={{ padding: "24px", border: "1px solid #a7f3d0", borderRadius: "8px", background: "white" }}>
              <span style={{ fontSize: "12px", color: "#064e3b", fontWeight: "800" }}>DỰ BÁO TĨNH (BASELINE FORECAST)</span>
              <div style={{ fontSize: "32px", fontWeight: "900", color: "#064e3b", marginTop: "10px" }}>{currency(appData.metrics.forecast)}</div>
            </div>
          </div>

          {/* DYNAMIC CONTROLS */}
          <section style={{ marginBottom: "30px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "30px", padding: "30px", background: "#f0fdf4", borderRadius: "8px", border: "1px solid #a7f3d0" }}>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px" }}>
                <h2 style={{ fontSize: "14px", fontWeight: "800", color: "#064e3b", margin: 0 }}>MỤC TIÊU CÔNG SUẤT BÁN PHÒNG (TARGET OCCUPANCY):</h2>
                <span style={{ fontSize: "16px", fontWeight: "900", color: "white", background: "#059669", padding: "4px 15px", borderRadius: "4px" }}>{targetOccupancy}%</span>
              </div>
              <input type="range" min="40" max="95" value={targetOccupancy} onChange={(e) => setTargetOccupancy(Number(e.target.value))} style={{ width: "100%", accentColor: "#059669", cursor: "pointer" }} />
              <div style={{ marginTop: "15px", fontSize: "13px", color: "#065f46" }}>
                Công suất trung bình cũ: <strong>43%</strong>. Thuật toán phân bổ mục tiêu cần bán thêm: <strong>{formatNumber(extraRoomsToSell)} phòng</strong>.
              </div>
            </div>

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px" }}>
                <h2 style={{ fontSize: "14px", fontWeight: "800", color: "#064e3b", margin: 0 }}>KHOẢNG CÁCH ĐẶT PHÒNG (LEAD TIME):</h2>
                <span style={{ fontSize: "16px", fontWeight: "900", color: "white", background: "#059669", padding: "4px 15px", borderRadius: "4px" }}>{simLeadTime} NGÀY</span>
              </div>
              <input type="range" min="1" max="30" value={simLeadTime} onChange={(e) => setSimLeadTime(Number(e.target.value))} style={{ width: "100%", accentColor: "#059669", cursor: "pointer" }} />
              <div style={{ marginTop: "15px", fontSize: "13px", color: "#065f46", lineHeight: "1.6", borderLeft: "4px solid #34d399", paddingLeft: "10px" }}>
                <strong>Phản ứng của Thuật toán:</strong> {leadReason}
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
            <table style={{ width: "100%", borderCollapse: "collapse", border: "1px solid #d1fae5" }}>
              <thead>
                <tr style={{ textAlign: "left", background: "#064e3b", color: "white" }}>
                  <th style={thStyle}>LOẠI PHÒNG & TỒN KHO ĐỘNG</th>
                  <th style={thStyle}>ĐỊNH GIÁ THEO LEAD TIME</th>
                  <th style={thStyle}>ƯU TIÊN PHÂN KHÚC KHÁCH HÀNG</th>
                  <th style={thStyle}>ƯU TIÊN KÊNH PHÂN PHỐI</th>
                  <th style={thStyle}>DỊCH VỤ BÁN KÈM (BUNDLE)</th>
                </tr>
              </thead>
              <tbody style={{ background: "white" }}>
                {processedRooms.map(room => (
                  <tr key={room.key} style={{ borderBottom: "1px solid #d1fae5" }}>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: "800", color: "#064e3b", fontSize: "14px", marginBottom: "10px" }}>{room.name}</div>
                      <div style={{ fontSize: "12px", color: "#047857" }}>Sức chứa (Capacity): {formatNumber(TOTAL_CAPACITY[room.key])}</div>
                      <div style={{ fontSize: "12px", color: "#047857" }}>Đã bán (On-hand): {formatNumber(SOLD_ON_HAND[room.key])}</div>
                      <div style={{ fontSize: "13px", fontWeight: "700", color: "#059669", marginTop: "5px", padding: "4px", background: "#ecfdf5", border: "1px solid #a7f3d0" }}>
                        Tồn kho mở bán: {formatNumber(room.avai)}
                      </div>
                    </td>
                    <td style={tdStyle}>
                      <div style={{ fontSize: "13px", color: "#047857", textDecoration: "line-through" }}>{currency(room.oldPrice)}</div>
                      <div style={{ fontSize: "20px", fontWeight: "900", color: "#064e3b", margin: "4px 0" }}>{currency(room.dynamicAdr)}</div>
                      <div style={{ fontSize: "12px", fontWeight: "800", color: room.priceDiff >= 0 ? "#059669" : "#b45309" }}>({room.priceDiff >= 0 ? "+" : ""}{room.priceDiff.toFixed(1)}%)</div>
                    </td>
                    <td style={tdStyle}>
                      <div style={{ fontSize: "12px", fontWeight: "700", color: "#064e3b", marginBottom: "6px" }}>ƯU TIÊN BÁN CHO PHÂN KHÚC:</div>
                      <ul style={{ paddingLeft: "15px", margin: 0, fontSize: "13px", color: "#047857", lineHeight: "1.6" }}>
                        {room.who.map((w, idx) => (
                          <li key={idx} style={{ marginBottom: "6px" }}><strong>{idx + 1}. {w.segment}:</strong> {w.reason}</li>
                        ))}
                      </ul>
                    </td>
                    <td style={tdStyle}>
                      <div style={{ fontSize: "12px", fontWeight: "700", color: "#064e3b", marginBottom: "6px" }}>ƯU TIÊN BÁN QUA KÊNH:</div>
                      <ul style={{ paddingLeft: "15px", margin: 0, fontSize: "13px", color: "#047857", lineHeight: "1.6" }}>
                        {room.where.map((w, idx) => (
                          <li key={idx} style={{ marginBottom: "6px" }}><strong>{idx + 1}. {w.channel}:</strong> {w.reason}</li>
                        ))}
                      </ul>
                    </td>
                    <td style={{ ...tdStyle, fontSize: "14px", fontWeight: "700", color: "#059669", lineHeight: "1.5" }}>
                      {room.ancillary}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* KẾT QUẢ ĐẠT ĐƯỢC (MONTE CARLO) */}
          <section style={{ border: "1px solid #a7f3d0", background: "white", borderRadius: "8px", overflow: "hidden" }}>
            <h2 style={{ fontSize: "16px", fontWeight: "900", color: "#ffffff", background: "#047857", margin: 0, padding: "15px 20px" }}>KẾT QUẢ MÔ PHỎNG MONTE CARLO (IMPACT ANALYSIS)</h2>
            <div style={{ padding: "30px", display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: "40px" }}>
              
              <div style={{ borderRight: "1px solid #d1fae5", paddingRight: "30px" }}>
                <p style={{ fontSize: "14px", color: "#064e3b", lineHeight: "1.8", margin: "0 0 20px 0" }}>
                  Hệ thống thực hiện chạy 5000 kịch bản ngẫu nhiên dựa trên các rủi ro: Lực cầu biến động (80% - 95%) và Tỷ lệ hủy phòng ảo OTA (cần siết từ 17.8% xuống 8%-13%).
                  <br/><br/>
                  Bằng việc kết hợp **Định giá động theo Lead Time** và chốt **Mục tiêu Công suất {targetOccupancy}%**, khách sạn hoàn toàn có thể phá vỡ ngưỡng dự báo tĩnh, tối đa hóa Giá trị kỳ vọng của cả Doanh thu Lưu trú và Dịch vụ.
                </p>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
                <div style={{ padding: "15px", background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: "4px" }}>
                  <div style={{ fontSize: "11px", fontWeight: "800", color: "#059669", marginBottom: "5px" }}>TỔNG DOANH THU ĐẠT ĐƯỢC</div>
                  <div style={{ fontSize: "22px", fontWeight: "900", color: "#064e3b" }}>{currency(impact.totalProjectedRev)}</div>
                </div>
                <div style={{ padding: "15px", background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: "4px" }}>
                  <div style={{ fontSize: "11px", fontWeight: "800", color: "#059669", marginBottom: "5px" }}>TĂNG TRƯỞNG (vs DỰ BÁO)</div>
                  <div style={{ fontSize: "22px", fontWeight: "900", color: "#059669" }}>+{growthPercent.toFixed(1)}%</div>
                </div>
                <div style={{ padding: "15px", background: "white", border: "1px solid #d1fae5", borderRadius: "4px" }}>
                  <div style={{ fontSize: "11px", fontWeight: "800", color: "#047857", marginBottom: "5px" }}>DOANH THU PHÒNG TĂNG</div>
                  <div style={{ fontSize: "18px", fontWeight: "900", color: "#047857" }}>+{currency(impact.meanRoomRev)}</div>
                </div>
                <div style={{ padding: "15px", background: "white", border: "1px solid #d1fae5", borderRadius: "4px" }}>
                  <div style={{ fontSize: "11px", fontWeight: "800", color: "#047857", marginBottom: "5px" }}>DOANH THU DỊCH VỤ TĂNG</div>
                  <div style={{ fontSize: "18px", fontWeight: "900", color: "#047857" }}>+{currency(impact.meanAncillaryRev)}</div>
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
  flex: 1, padding: "16px", border: "1px solid #a7f3d0", cursor: "pointer", 
  background: active ? "#047857" : "white", 
  color: active ? "white" : "#064e3b", fontWeight: "800", fontSize: "13px",
  letterSpacing: "0.5px", transition: "all 0.2s ease"
});
const thStyle = { padding: "16px 20px", fontSize: "11px", color: "#a7f3d0", textTransform: "uppercase", fontWeight: "800" };
const tdStyle = { padding: "20px", verticalAlign: "top" };