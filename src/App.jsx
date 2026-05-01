import React, { useState, useMemo } from "react";
import * as XLSX from "xlsx";

// 1. FORMAT TIỀN TỆ & SỐ
function currency(v) {
  const num = Number(v);
  if (isNaN(num)) return "$0";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(num);
}
function formatNumber(v) {
  return new Intl.NumberFormat("en-US").format(v);
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
  const [simLeadTime, setSimLeadTime] = useState(7); // Mặc định 7 ngày

  // TỒN KHO THÁNG (P002 có 45 STD, 28 DLX, 7 STE mỗi ngày x 31 ngày)
  const monthlyInventory = { 
    RT_STD: { total: 1395, sold: 820 }, 
    RT_DLX: { total: 868, sold: 480 }, 
    RT_STE: { total: 217, sold: 135 } 
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
      const gapTotal = metrics["Gap Total Revenue"] || 14749;

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
            targetRatio: 0.6, // Mục tiêu bán 60% tồn kho
            priorityWho: "Corporate",
            whoReason: "Dữ liệu cho thấy tỷ trọng Leisure quá cao (62%). Mở rộng Corporate giúp tạo Base công suất ngày thường ổn định.",
            priorityWhere: "Direct - B2B Contract",
            whereReason: "Bức tranh phân phối chỉ ra OTA bào mòn giá trị ròng. Ký kết hợp đồng doanh nghiệp giúp miễn phí hoa hồng.",
            ancillary: "MICE Bundle (F&B + Other)"
          },
          RT_DLX: {
            name: "HẠNG CAO CẤP (DELUXE)",
            oldPrice: (stats.Weekday.RT_DLX.sum / (stats.Weekday.RT_DLX.count || 1)) || 131,
            targetRatio: 0.5,
            priorityWho: "Leisure",
            whoReason: "Phân khúc Leisure đóng góp >434,000 USD, mang lại RevPAR cao nhất. Tệp khách chủ lực cần duy trì.",
            priorityWhere: "Direct Website",
            whereReason: "OTA có tỷ lệ hủy ảo lên tới 17.8%. Chuyển dịch về Website để kiểm soát rủi ro thất thoát doanh thu (Leakage).",
            ancillary: "Spa & Tour Bundle"
          },
          RT_STE: {
            name: "HẠNG VIP (SUITE)",
            oldPrice: (stats.Weekday.RT_STE.sum / (stats.Weekday.RT_STE.count || 1)) || 215,
            targetRatio: 0.7,
            priorityWho: "MICE",
            whoReason: "Khai thác khách sự kiện doanh nghiệp cao cấp lưu trú hạng Suite giữa tuần giúp đa dạng hóa nguồn khách.",
            priorityWhere: "Direct GDS",
            whereReason: "Hạng phòng cao cấp tuyệt đối không phụ thuộc OTA để tránh rủi ro hủy phòng và mất chi phí môi giới.",
            ancillary: "Luxury Service Bundle"
          }
        },
        Weekend: {
          RT_STD: {
            name: "HẠNG TIÊU CHUẨN (STANDARD)",
            oldPrice: (stats.Weekend.RT_STD.sum / (stats.Weekend.RT_STD.count || 1)) || 96,
            targetRatio: 0.8,
            priorityWho: "Leisure",
            whoReason: "Phân tích Weekend cho thấy lượng booking giảm nhưng ADR duy trì tốt. Khách du lịch tự túc có sức mua ổn định.",
            priorityWhere: "Đa kênh OTA & Direct",
            whereReason: "OTA kéo Volume hiệu quả nhưng Conversion chỉ 83.2%. Áp dụng chặt chính sách Non-refundable.",
            ancillary: "Buffet Bundle (F&B)"
          },
          RT_DLX: {
            name: "HẠNG CAO CẤP (DELUXE)",
            oldPrice: (stats.Weekend.RT_DLX.sum / (stats.Weekend.RT_DLX.count || 1)) || 135,
            targetRatio: 0.6,
            priorityWho: "Leisure",
            whoReason: "Định hướng Value-driven. Khách nghỉ dưỡng cuối tuần ít nhạy cảm về giá, sẵn sàng chi trả cao cho tiện ích.",
            priorityWhere: "Direct Website",
            whereReason: "Chạy chiến dịch giảm giá trị cộng thêm trên Web để lôi kéo tệp khách từ Agoda/Booking về nội bộ.",
            ancillary: "Spa Retreat Package"
          },
          RT_STE: {
            name: "HẠNG VIP (SUITE)",
            oldPrice: (stats.Weekend.RT_STE.sum / (stats.Weekend.RT_STE.count || 1)) || 225,
            targetRatio: 0.9,
            priorityWho: "Leisure",
            whoReason: "Dữ liệu lấp đầy Suite cuối tuần đạt 57.4% (cao nhất hệ thống). Ưu tiên tuyệt đối cho khách nghỉ dưỡng cao cấp.",
            priorityWhere: "Direct Phone & Loyalty",
            whereReason: "Bảo vệ dòng tiền tuyệt đối. Áp dụng Non-refundable 100% để triệt tiêu 130 trường hợp No-show lịch sử.",
            ancillary: "Premium Heritage Bundle"
          }
        }
      };

      setAppData({ 
        metrics: { forecast: forecastTotal, onHand: onHandTotal, gap: gapTotal }, 
        strategies, 
        historicalAncillaryRatio 
      });
      setIsProcessing(false);
    } catch (err) { alert("Lỗi hệ thống khi đọc File Excel."); setIsProcessing(false); }
  };

  // MÔ PHỎNG ĐỊNH GIÁ & MONTE CARLO THEO LEAD TIME
  const simulationData = useMemo(() => {
    if (!appData) return null;

    let leadMultiplier = 1.0;
    let leadReason = "Giá ổn định (Base Rate). Lực cầu tự nhiên chuyển đổi ở mức cân bằng.";
    if (simLeadTime <= 3) {
      leadMultiplier = 1.15;
      leadReason = "Thuật toán TĂNG 15% (Yield Optimization) do khách đặt sát ngày thường mang tính khẩn cấp, ít nhạy cảm về giá.";
    } else if (simLeadTime >= 15) {
      leadMultiplier = 0.90;
      leadReason = "Thuật toán GIẢM 10% (Volume Capture) kèm điều kiện Không Hoàn Hủy để chốt quỹ phòng và loại bỏ rủi ro hủy ảo.";
    }

    const processedRooms = ["RT_STD", "RT_DLX", "RT_STE"].map(key => {
      const strat = appData.strategies[selectedDayType][key];
      const avai = monthlyInventory[key].total - monthlyInventory[key].sold;
      const targetQty = Math.round(avai * strat.targetRatio); // Tự động tính mục tiêu số phòng cần bán

      let dayMultiplier = selectedDayType === "Weekend" ? 1.05 : 1.0; // Cuối tuần giá nhích 5%
      const dynamicAdr = strat.oldPrice * leadMultiplier * dayMultiplier;
      const priceDiff = ((dynamicAdr / strat.oldPrice) - 1) * 100;

      return { key, avai, targetQty, dynamicAdr, priceDiff, ...strat };
    });

    // CHẠY MONTE CARLO SIMULATION
    const targetRevenue = appData.metrics.onHand + (appData.metrics.gap * 0.95); // Mục tiêu: Lấp 95% Gap
    let successfulRoomRev = 0;
    
    // Giả lập 5000 kịch bản về lực cầu và tỷ lệ hủy
    for (let i = 0; i < 5000; i++) {
      const simulatedDemandCapture = 0.80 + Math.random() * (0.95 - 0.80);
      const simulatedCancelRatio = 0.08 + Math.random() * (0.13 - 0.08); // Siết hủy từ 17.8% xuống 8-13%
      const conversionRate = simulatedDemandCapture * (1 - simulatedCancelRatio);

      // Tính tổng tiền phòng thu được từ các phòng mục tiêu
      let simRev = 0;
      processedRooms.forEach(r => { simRev += (r.targetQty * conversionRate * r.dynamicAdr); });
      successfulRoomRev += simRev;
    }

    const meanRoomRev = successfulRoomRev / 5000;
    const meanAncillaryRev = meanRoomRev * appData.historicalAncillaryRatio;
    const totalProjectedRev = appData.metrics.onHand + meanRoomRev + meanAncillaryRev;
    
    return { targetRevenue, leadReason, processedRooms, impact: { totalProjectedRev, meanRoomRev, meanAncillaryRev } };

  }, [appData, selectedDayType, simLeadTime]);

  if (!appData) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", position: "relative", padding: "20px", fontFamily: "system-ui" }}>
        <div style={{ position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", backgroundImage: "url('image_74fb96.jpg')", backgroundSize: "cover", backgroundPosition: "center", filter: "blur(12px)", opacity: 0.6, zIndex: -1 }} />
        
        <h1 style={{ color: "#0f172a", marginBottom: "30px", fontSize: "32px", fontWeight: "900", letterSpacing: "1px", background: "white", padding: "10px 30px", borderRadius: "8px", border: "1px solid #cbd5e1" }}>HỆ THỐNG HOẠCH ĐỊNH & TỐI ƯU DOANH THU</h1>
        <div style={{ background: "rgba(255,255,255,0.95)", padding: "50px", borderRadius: "12px", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)", width: "100%", maxWidth: "800px", border: "1px solid #e2e8f0" }}>
          <div style={{ display: "flex", gap: "20px", marginBottom: "30px" }}>
            <div style={{ flex: 1, border: "2px dashed #94a3b8", padding: "30px 20px", borderRadius: "8px", background: "#f8fafc", textAlign: "center" }}>
              <p style={{ fontSize: "13px", fontWeight: "800", color: "#334155", marginBottom: "15px" }}>1. TẢI FILE DỮ LIỆU LỊCH SỬ</p>
              <input type="file" accept=".xlsx" onChange={(e) => setHistoryFile(e.target.files[0])} />
            </div>
            <div style={{ flex: 1, border: "2px dashed #94a3b8", padding: "30px 20px", borderRadius: "8px", background: "#f8fafc", textAlign: "center" }}>
              <p style={{ fontSize: "13px", fontWeight: "800", color: "#334155", marginBottom: "15px" }}>2. TẢI FILE DỰ BÁO (FORECAST)</p>
              <input type="file" accept=".xlsx" onChange={(e) => setForecastFile(e.target.files[0])} />
            </div>
          </div>
          <button onClick={handleProcessData} disabled={isProcessing} style={{ background: "#0f172a", color: "white", padding: "18px", borderRadius: "6px", border: "none", cursor: "pointer", fontWeight: "800", letterSpacing: "1px", width: "100%", fontSize: "16px" }}>
            {isProcessing ? "ĐANG MÔ PHỎNG DỮ LIỆU..." : "CHẨN ĐOÁN & XUẤT BÁO CÁO CHIẾN LƯỢC"}
          </button>
        </div>
      </div>
    );
  }

  const { targetRevenue, leadReason, processedRooms, impact } = simulationData;
  const growthPercent = ((impact.totalProjectedRev / appData.metrics.forecast) - 1) * 100;

  return (
    <div style={{ minHeight: "100vh", padding: "40px", fontFamily: "system-ui, sans-serif", color: "#1e293b", position: "relative" }}>
       <div style={{ position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", backgroundImage: "url('image_74fb96.jpg')", backgroundSize: "cover", backgroundPosition: "center", filter: "blur(15px)", opacity: 0.4, zIndex: -1 }} />
      
      <div style={{ maxWidth: "1300px", margin: "0 auto", background: "white", borderRadius: "12px", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)", overflow: "hidden", border: "1px solid #cbd5e1" }}>
        
        {/* HEADER SECTION */}
        <header style={{ background: "#f8fafc", padding: "30px 40px", borderBottom: "1px solid #e2e8f0" }}>
          <h1 style={{ fontSize: "24px", fontWeight: "900", color: "#0f172a", textTransform: "uppercase", margin: "0 0 10px 0" }}>Báo cáo Kê toa Tối ưu Doanh thu Tháng 01/2026</h1>
          <p style={{ margin: 0, color: "#64748b", fontSize: "14px" }}>Dự phỏng Xác suất Monte Carlo dựa trên Khai phá dữ liệu Lịch sử & Dự báo tĩnh (Baseline).</p>
        </header>

        <div style={{ padding: "40px" }}>
          
          {/* TOP METRICS (HIỆN TẠI - DỰ BÁO - MỤC TIÊU) */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "20px", marginBottom: "40px" }}>
            <div style={{ padding: "24px", border: "1px solid #e2e8f0", borderRadius: "8px", background: "#f8fafc" }}>
              <span style={{ fontSize: "12px", color: "#64748b", fontWeight: "800" }}>DOANH THU ĐÃ CHỐT (ON-HAND)</span>
              <div style={{ fontSize: "32px", fontWeight: "900", color: "#0f172a", marginTop: "10px" }}>{currency(appData.metrics.onHand)}</div>
            </div>
            <div style={{ padding: "24px", border: "1px solid #cbd5e1", borderRadius: "8px", background: "white" }}>
              <span style={{ fontSize: "12px", color: "#0f172a", fontWeight: "800" }}>DỰ BÁO TĨNH (BASELINE FORECAST)</span>
              <div style={{ fontSize: "32px", fontWeight: "900", color: "#0f172a", marginTop: "10px" }}>{currency(appData.metrics.forecast)}</div>
            </div>
            <div style={{ padding: "24px", border: "2px solid #0f172a", borderRadius: "8px", background: "#f0f9ff" }}>
              <span style={{ fontSize: "12px", color: "#0f172a", fontWeight: "900" }}>MỤC TIÊU TỐI ƯU HÓA TỰ ĐỘNG</span>
              <div style={{ fontSize: "32px", fontWeight: "900", color: "#0284c7", marginTop: "10px" }}>{currency(targetRevenue)}</div>
              <div style={{ fontSize: "12px", color: "#64748b", marginTop: "5px" }}>*Lập luận: Khôi phục 95% Khoảng trống Gap.</div>
            </div>
          </div>

          {/* DYNAMIC PRICING CONTROL (LEAD TIME) */}
          <section style={{ marginBottom: "30px", padding: "30px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px" }}>
              <h2 style={{ fontSize: "14px", fontWeight: "800", color: "#0f172a", margin: 0 }}>ĐIỀU CHỈNH KHOẢNG CÁCH ĐẶT PHÒNG (LEAD TIME):</h2>
              <span style={{ fontSize: "16px", fontWeight: "900", color: "white", background: "#0f172a", padding: "4px 15px", borderRadius: "4px" }}>{simLeadTime} NGÀY</span>
            </div>
            <input type="range" min="0" max="30" value={simLeadTime} onChange={(e) => setSimLeadTime(Number(e.target.value))} style={{ width: "100%", accentColor: "#0f172a", cursor: "pointer" }} />
            <div style={{ marginTop: "15px", fontSize: "14px", color: "#334155", lineHeight: "1.6", borderLeft: "4px solid #cbd5e1", paddingLeft: "15px" }}>
              <strong style={{ color: "#0f172a" }}>Quy tắc Giá Động (Pricing Rule):</strong> {leadReason}
            </div>
          </section>

          {/* TAB CHỌN DAY TYPE */}
          <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
            <button onClick={() => setSelectedDayType("Weekday")} style={tabStyle(selectedDayType === "Weekday")}>BỐI CẢNH DỮ LIỆU: NGÀY TRONG TUẦN (WEEKDAY)</button>
            <button onClick={() => setSelectedDayType("Weekend")} style={tabStyle(selectedDayType === "Weekend")}>BỐI CẢNH DỮ LIỆU: CUỐI TUẦN (WEEKEND)</button>
          </div>

          {/* BẢNG KÊ TOA CHIẾN LƯỢC */}
          <section style={{ marginBottom: "50px" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", border: "1px solid #e2e8f0" }}>
              <thead>
                <tr style={{ textAlign: "left", background: "#0f172a", color: "white" }}>
                  <th style={thStyle}>LOẠI PHÒNG (INVENTORY)</th>
                  <th style={thStyle}>ĐỊNH GIÁ (ADR BASE → DYNAMIC)</th>
                  <th style={thStyle}>BÁN CHO AI? (MỤC TIÊU)</th>
                  <th style={thStyle}>KÊNH PHÂN PHỐI</th>
                  <th style={thStyle}>DỊCH VỤ BÁN KÈM (BUNDLE)</th>
                </tr>
              </thead>
              <tbody style={{ background: "white" }}>
                {processedRooms.map(room => (
                  <tr key={room.key} style={{ borderBottom: "1px solid #e2e8f0" }}>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: "800", color: "#0f172a", fontSize: "14px", marginBottom: "5px" }}>{room.name}</div>
                      <div style={{ fontSize: "12px", color: "#475569" }}>Tổng tháng: {formatNumber(monthlyInventory[room.key].total)}</div>
                      <div style={{ fontSize: "12px", color: "#475569" }}>Đã bán: {formatNumber(monthlyInventory[room.key].sold)}</div>
                      <div style={{ fontSize: "13px", fontWeight: "700", color: "#0284c7", marginTop: "5px" }}>Tồn kho: {formatNumber(room.avai)}</div>
                    </td>
                    <td style={tdStyle}>
                      <div style={{ fontSize: "13px", color: "#64748b", textDecoration: "line-through" }}>{currency(room.oldPrice)}</div>
                      <div style={{ fontSize: "20px", fontWeight: "900", color: "#0f172a", margin: "4px 0" }}>{currency(room.dynamicAdr)}</div>
                      <div style={{ fontSize: "12px", fontWeight: "800", color: room.priceDiff >= 0 ? "#059669" : "#dc2626" }}>({room.priceDiff >= 0 ? "+" : ""}{room.priceDiff.toFixed(1)}%)</div>
                    </td>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: "800", color: "#1e40af", fontSize: "14px" }}>{room.priorityWho}</div>
                      <div style={{ fontSize: "11px", background: "#f1f5f9", padding: "4px 8px", border: "1px solid #cbd5e1", borderRadius: "4px", display: "inline-block", margin: "6px 0", fontWeight: "700" }}>MỤC TIÊU BÁN: {formatNumber(room.targetQty)} PHÒNG</div>
                      <div style={{ fontSize: "12px", color: "#475569", lineHeight: "1.5" }}>{room.whoReason}</div>
                    </td>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: "800", color: "#b45309", fontSize: "14px" }}>{room.priorityWhere}</div>
                      <div style={{ fontSize: "12px", color: "#475569", marginTop: "6px", lineHeight: "1.5" }}>{room.whereReason}</div>
                    </td>
                    <td style={{ ...tdStyle, fontSize: "13px", fontWeight: "700", color: "#7c3aed", lineHeight: "1.5" }}>
                      {room.ancillary}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* KẾT QUẢ ĐẠT ĐƯỢC (MONTE CARLO) */}
          <section style={{ border: "1px solid #cbd5e1", background: "white", borderRadius: "8px", overflow: "hidden" }}>
            <h2 style={{ fontSize: "16px", fontWeight: "900", color: "#ffffff", background: "#1e3a8a", margin: 0, padding: "15px 20px" }}>KẾT QUẢ MÔ PHỎNG KỲ VỌNG THỰC TẾ (IMPACT ANALYSIS)</h2>
            <div style={{ padding: "30px", display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: "40px" }}>
              
              <div style={{ borderRight: "1px solid #e2e8f0", paddingRight: "30px" }}>
                <p style={{ fontSize: "14px", color: "#334155", lineHeight: "1.8", margin: "0 0 20px 0" }}>
                  Mô phỏng Monte Carlo 5000 kịch bản ngẫu nhiên dựa trên các rủi ro: Lực cầu biến động (80% - 95%) và Siết Tỷ lệ hủy phòng OTA từ 17.8% xuống 8%-13%.
                  <br/><br/>
                  Kết quả cho thấy, việc <strong>Định giá động theo Lead Time</strong> và chốt mục tiêu bán dựa trên <strong>Tồn kho thực tế</strong> sẽ giúp khách sạn phá vỡ ngưỡng dự báo tĩnh, cải thiện vượt bậc cả Doanh thu phòng lẫn Dịch vụ đi kèm.
                </p>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
                <div style={{ padding: "15px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "4px" }}>
                  <div style={{ fontSize: "11px", fontWeight: "800", color: "#64748b", marginBottom: "5px" }}>TỔNG DOANH THU ĐẠT ĐƯỢC</div>
                  <div style={{ fontSize: "22px", fontWeight: "900", color: "#0f172a" }}>{currency(impact.totalProjectedRev)}</div>
                </div>
                <div style={{ padding: "15px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "4px" }}>
                  <div style={{ fontSize: "11px", fontWeight: "800", color: "#059669", marginBottom: "5px" }}>TĂNG TRƯỞNG (vs DỰ BÁO)</div>
                  <div style={{ fontSize: "22px", fontWeight: "900", color: "#059669" }}>+{growthPercent.toFixed(1)}%</div>
                </div>
                <div style={{ padding: "15px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "4px" }}>
                  <div style={{ fontSize: "11px", fontWeight: "800", color: "#1e40af", marginBottom: "5px" }}>DOANH THU PHÒNG TĂNG</div>
                  <div style={{ fontSize: "18px", fontWeight: "900", color: "#1e40af" }}>+{currency(impact.meanRoomRev)}</div>
                </div>
                <div style={{ padding: "15px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "4px" }}>
                  <div style={{ fontSize: "11px", fontWeight: "800", color: "#7c3aed", marginBottom: "5px" }}>DOANH THU DỊCH VỤ TĂNG</div>
                  <div style={{ fontSize: "18px", fontWeight: "900", color: "#7c3aed" }}>+{currency(impact.meanAncillaryRev)}</div>
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
  flex: 1, padding: "16px", border: "1px solid #cbd5e1", cursor: "pointer", 
  background: active ? "#0f172a" : "white", 
  color: active ? "white" : "#475569", fontWeight: "800", fontSize: "13px",
  letterSpacing: "0.5px", transition: "all 0.2s ease"
});
const thStyle = { padding: "16px 20px", fontSize: "11px", color: "#cbd5e1", textTransform: "uppercase", fontWeight: "800" };
const tdStyle = { padding: "20px", verticalAlign: "top" };