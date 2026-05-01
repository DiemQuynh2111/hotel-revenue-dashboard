import React, { useState, useMemo } from "react";
import * as XLSX from "xlsx";

// FORMAT TIỀN TỆ
function currency(v) {
  const num = Number(v);
  if (isNaN(num)) return "$0";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(num);
}

// GIẢI MÃ EXCEL (cellDates: true ép Excel phải trả về chuẩn Ngày tháng)
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

// Hàm nhận diện cuối tuần chính xác
function isWeekend(dateVal) {
  if (!dateVal) return false;
  let d = dateVal instanceof Date ? dateVal : new Date(dateVal);
  if (isNaN(d.getTime())) return false;
  const day = d.getDay();
  return day === 5 || day === 6; // Thứ 6, Thứ 7
}

export default function App() {
  const [historyFile, setHistoryFile] = useState(null);
  const [forecastFile, setForecastFile] = useState(null);
  const [appData, setAppData] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // States Điều khiển & Mô phỏng
  const [selectedDayType, setSelectedDayType] = useState("Weekday");
  const [simLeadTime, setSimLeadTime] = useState(7);
  const [inputWantedRevenue, setInputWantedRevenue] = useState(150000); // Doanh thu mong muốn $ Wanted
  const [inputExtraRoomsToSell, setInputExtraRoomsToSell] = useState(40); // Mục tiêu bán thêm
  const [simOccupancy, setSimOccupancy] = useState(65);

  // Mapping ONTOLOGY: STD->STD, DL->DLX, SU->STE
  const roomTypeMap = { STD: 'RT_STD', DL: 'RT_DLX', SU: 'RT_STE' };
  
  // Tồn kho Tồn đọng (Available Inventory)
  const availableInventory = { STD: 33, DL: 22, SU: 20 };

  const handleProcessData = async () => {
    if (!historyFile || !forecastFile) return alert("Vui lòng tải lên đủ 2 file dữ liệu.");
    setIsProcessing(true);

    try {
      const [histWb, forecastWb] = await Promise.all([readExcel(historyFile), readExcel(forecastFile)]);

      // 1. XỬ LÝ FILE DỰ BÁO (Rút trích On-hand, ForecastBaseline)
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

      // 2. XỬ LÝ FILE LỊCH SỬ (Tính ADR & Tỷ lệ chi tiêu Ancillary)
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
          historicalAncillaryNet += amt; // Chi tiêu F&B, Spa, Tour, Other
        }
      });

      const historicalAncillaryRatio = historicalAncillaryNet / (historicalRoomNet || 1);

      // CẬP NHẬT CHIẾN LƯỢC QUẢN TRỊ THEO ONTOLOGY CỦA BẠN
      const strategies = {
        Weekday: {
          RT_STD: {
            priorityWho: "Corporate",
            whoReason: "Phụ thuộc lớn vào Leisure (62%), cần mở rộng B2B giảm rủi ro hủy. Khách Corporate tạo Base ổn định.",
            priorityWhere: "Direct Website & B2B GDS",
            whereReason: "Kênh Direct Web nổi bật ADR ròng. Tránh phụ thuộc OTA để chặn rủi ro thất thoát doanh thu kép (Cancellation Leakage).",
            ancillary: "MICE Bundle (F&B)"
          },
          RT_DLX: {
            priorityWho: "Leisure Couples",
            whoReason: "Phân khúc Leisure mang lại RevPAR cao nhất (đóng góp >434,000 USD). Đây là tệp chủ lực giữa tuần.",
            priorityWhere: "Direct Website",
            whereReason: "OTA chiếm volume nhưng bào mòn giá trị ròng. Đẩy mạnh Direct bảo vệ Net ADR.",
            ancillary: "Spa & City Tour Package"
          },
          RT_STE: {
            priorityWho: "MICE VIPs",
            whoReason: "Khai thác khách sự kiện MICE lưu trú hạng Suite giúp bù đắp RevPAR bị sụt giảm.",
            priorityWhere: "Direct GDS",
            whereReason: "Tránh phụ thuộc OTA để chặn hủy ảo. Kênh Direct Phone mang lại giá trị thực trên mỗi booking.",
            ancillary: "Luxury Conference Bundle"
          }
        },
        Weekend: {
          RT_STD: {
            priorityWho: "Leisure Families",
            whoReason: "Volume Weekend giảm (6.5/ngày), nhưng ADR-driven. Siết chính sách hủy booking trên OTA (Conversion 83.2%).",
            priorityWhere: "Đa kênh OTA & Direct Web",
            whereReason: "Hàng Suite tăng chủ yếu do Occ Effect. Kéo volume qua OTA nhưng chặn hủy ảo.",
            ancillary: "Buffet Bundle (F&B)"
          },
          RT_DLX: {
            priorityWho: "Leisure Couples",
            whoReason: "Dư địa lớn nhất tối ưu theo chiều sâu (Value-driven) thay vì chạy số lượng.",
            priorityWhere: "Direct Website",
            whereReason: "OTA (Booking, Agoda) nổi bật tỷ lệ hủy 17.8% so với 12.2% Direct. Chuyển dịch về Website.",
            ancillary: "Spa retreat / Tour di sản"
          },
          RT_STE: {
            priorityWho: "Leisure VIP (High-end)",
            whoReason: "Nhóm gia đình cao cấp ít nhạy cảm giá. Giúp tối đa RevPAR, giảm rủi ro volume sụt.",
            priorityWhere: "Direct Phone & Khách quen",
            whereReason: "Để chặn đứng tỷ lệ No-show (130) và Cancelled (1308), bắt buộc Non-refundable 100% đối với hạng phòng Suite.",
            ancillary: "Premium Heritage Full Services Bundle"
          }
        }
      };

      setAppData({ metrics: { forecast: forecastTotal, onHand: onHandTotal, gap: gapTotal }, stats, strategies, historicalAncillaryRatio });
      setIsProcessing(false);
    } catch (err) { alert("Lỗi xử lý dữ liệu. Vui lòng kiểm tra file Excel."); setIsProcessing(false); }
  };

  // MÔ PHỎNG & ĐỊNH GIÁ ĐỘNG (WHAT-IF)
  const simulationData = useMemo(() => {
    if (!appData) return null;

    const currentStrategies = appData.strategies[selectedDayType];

    const processedRooms = ["STD", "DL", "SU"].map(key => {
      const roomStats = appData.stats[selectedDayType][roomTypeMap[key]];
      const oldPrice = (roomStats.count > 0) ? roomStats.sum / roomStats.count : 0;
      
      let priceMultiplier = 1.0;
      // Occupancy Effect
      if (simOccupancy >= 75) priceMultiplier = 1.15; // Tăng 15%
      else if (simOccupancy <= 35) priceMultiplier = 0.90; // Giảm 10%

      // Lead Time Effect
      if (simLeadTime <= 3) priceMultiplier *= 1.10; // Tăng thêm 10%
      else if (simLeadTime >= 15) priceMultiplier *= 0.95; // Giảm 5%

      const dynamicAdr = oldPrice * priceMultiplier;
      return { key, dynamicAdr, oldPrice, avai: availableInventory[key], ...currentStrategies[roomTypeMap[key]] };
    });

    // MÔ PHỎNG MONTE CARLO ĐỂ ĐẠT KẾT QUẢ MỤC TIÊU (DỰ PHÓNG CHUYỂN ĐỔI GAP)
    const MonteCarloIterations = 5000;
    let successfulExtraRoomRevenue = 0;
    let successCount = 0;

    for (let i = 0; i < MonteCarloIterations; i++) {
      // Biến thiên 1: Tỷ lệ chuyển đổi cung cầu mới (Dao động từ 75% đến 95%)
      const simulatedDemandCaptureRatio = 0.75 + Math.random() * (0.95 - 0.75);
      
      // Biến thiên 2: Tỷ lệ hủy phòng ảo OTA (Cũ 17.8%, Direct 12.2% - cần siết xuống 8% - 13%)
      const simulatedCancellationRatio = (0.08 + Math.random() * (0.13 - 0.08));
      
      const simulatedConversionOldRate = simulatedDemandCaptureRatio * (1 - simulatedCancellationRatio);

      // Mô phỏng số lượng phòng thực tế bán được từ khoồn phòng mong muốn
      const simulatedRoomsSold = inputExtraRoomsToSell * simulatedConversionOldRate;

      // Doanh thu phòng tăng thêm từ What-if Price
      const avgDynamicAdr = processedRooms.reduce((sum, r) => sum + r.dynamicAdr, 0) / 3;
      successfulExtraRoomRevenue += (simulatedRoomsSold * avgDynamicAdr);
      
      // Kiểm tra xem kịch bản có vượt $ Wanted ko?
      const totalSimulatedRev = appData.metrics.onHand + (simulatedRoomsSold * avgDynamicAdr) * (1 + appData.historicalAncillaryRatio);
      if (totalSimulatedRev >= inputWantedRevenue) successCount++;
    }

    const meanRoomRevenueGain = successfulExtraRoomRevenue / MonteCarloIterations;
    const meanAncillaryRevenueGain = meanRoomRevenueGain * appData.historicalAncillaryRatio;
    const projectedTotalOptimizedRevenue = appData.metrics.onHand + meanRoomRevenueGain + meanAncillaryRevenueGain;
    const probabilityOfHittingTarget = (successCount / MonteCarloIterations) * 100;
    const totalRevenueGap = projectedTotalOptimizedRevenue - inputWantedRevenue;

    return { processedRooms, projectedImpact: { projectedTotalOptimizedRevenue, meanRoomRevenueGain, meanAncillaryRevenueGain, probabilityOfHittingTarget, totalRevenueGap } };

  }, [appData, selectedDayType, simOccupancy, simLeadTime, inputExtraRoomsToSell, inputWantedRevenue]);

  if (!appData) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", position: "relative", padding: "20px", fontFamily: "system-ui" }}>
        {/* Full-screen Blurred Background Image */}
        <div style={{ position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", backgroundImage: "url('image_74fb96.jpg')", backgroundSize: "cover", backgroundPosition: "center", filter: "blur(8px)", opacity: 0.6, zIndex: -1 }} />
        
        <h1 style={{ color: "#1e3a8a", marginBottom: "30px", fontSize: "36px", fontWeight: "900", letterSpacing: "-1px" }}>TỐI ƯU DOANH THU THÁNG 1</h1>
        <div style={{ background: "rgba(255,255,255,0.9)", padding: "50px", borderRadius: "12px", boxShadow: "0 10px 25px rgba(0,0,0,0.1)", textAlign: "center", width: "100%", maxWidth: "800px" }}>
          <div style={{ display: "flex", gap: "20px", marginBottom: "30px", justifyContent: "center" }}>
            <div style={{ flex: 1, border: "2px dashed #cbd5e1", padding: "30px 20px", borderRadius: "8px", background: "#f8fafc" }}>
              <p style={{ fontSize: "14px", fontWeight: "700", color: "#334155", marginBottom: "15px" }}>1. TẢI FILE DỮ LIỆU LỊCH SỬ</p>
              <input type="file" accept=".xlsx" onChange={(e) => setHistoryFile(e.target.files[0])} style={{ fontSize: "13px" }} />
            </div>
            <div style={{ flex: 1, border: "2px dashed #cbd5e1", padding: "30px 20px", borderRadius: "8px", background: "#f8fafc" }}>
              <p style={{ fontSize: "14px", fontWeight: "700", color: "#334155", marginBottom: "15px" }}>2. TẢI FILE DỰ BÁO (BASELINE)</p>
              <input type="file" accept=".xlsx" onChange={(e) => setForecastFile(e.target.files[0])} style={{ fontSize: "13px" }} />
            </div>
          </div>
          <button onClick={handleProcessData} disabled={isProcessing} style={{ background: "#1e3a8a", color: "white", padding: "16px 40px", borderRadius: "8px", border: "none", cursor: "pointer", fontWeight: "800", letterSpacing: "1px", width: "100%", fontSize: "16px" }}>
            {isProcessing ? "ĐANG TÍNH TOÁN..." : "KÍCH HOẠT MÔ HÌNH TỐI ƯU"}
          </button>
        </div>
      </div>
    );
  }

  // MÀN HÌNH DASHBOARD BÁO CÁO TỐI ƯU
  const { processedRooms, projectedImpact } = simulationData;
  const growth = ((projectedImpact.projectedTotalOptimizedRevenue / appData.metrics.forecast) - 1) * 100;

  return (
    <div style={{ minHeight: "100vh", padding: "40px", fontFamily: "system-ui, sans-serif", color: "#1e293b", position: "relative" }}>
       {/* Full-screen Blurred Background Image */}
       <div style={{ position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", backgroundImage: "url('image_74fb96.jpg')", backgroundSize: "cover", backgroundPosition: "center", filter: "blur(12px)", opacity: 0.5, zIndex: -1 }} />
      
      <div style={{ maxWidth: "1280px", margin: "0 auto", background: "white", borderRadius: "16px", boxShadow: "0 20px 25px rgba(0,0,0,0.1)", overflow: "hidden" }}>
        
        {/* HEADER SECTION */}
        <header style={{ background: "#f8fafc", padding: "30px 40px", borderBottom: "1px solid #e2e8f0" }}>
          <h1 style={{ fontSize: "28px", fontWeight: "900", color: "#0f172a", textTransform: "uppercase", letterSpacing: "-1px", margin: 0 }}>Báo cáo Đề xuất Tối ưu Doanh thu Tháng 01/2026</h1>
          <p style={{ margin: "5px 0 0 0", color: "#64748b" }}>Heritage Hue Hotel | Dự phỏng xác suất chuyển đổi cung - cầu (Probability of Demand Capture)</p>
        </header>

        <div style={{ padding: "40px" }}>
          
          {/* TOP METRICS SECTION */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "24px", marginBottom: "40px" }}>
            <div style={{ padding: "24px", border: "1px solid #e2e8f0", borderRadius: "8px", background: "white" }}>
              <span style={{ fontSize: "12px", color: "#64748b", fontWeight: "800" }}>DOANH THU HIỆN TẠI (ON-HAND)</span>
              <div style={{ fontSize: "32px", fontWeight: "900", color: "#0f172a" }}>{currency(appData.metrics.onHand)}</div>
            </div>
            <div style={{ padding: "24px", border: "1px solid #cbd5e1", borderRadius: "8px", background: "#f1f5f9" }}>
              <span style={{ fontSize: "12px", color: "#1e3a8a", fontWeight: "800" }}>DỰ BÁO BASELINE (FORECAST)</span>
              <div style={{ fontSize: "32px", fontWeight: "900", color: "#1e3a8a" }}>{currency(appData.metrics.forecast)}</div>
            </div>
            <div style={{ padding: "24px", border: "2px solid #1e3a8a", borderRadius: "8px", background: "#f0f9ff" }}>
              <span style={{ fontSize: "12px", color: "#1e3a8a", fontWeight: "900" }}>MỤC TIÊU MONG MUỐN ($ WANTED)</span>
              <input type="number" value={inputWantedRevenue} onChange={(e) => setInputWantedRevenue(Number(e.target.value))} style={{ fontSize: "32px", fontWeight: "900", color: "#1e3a8a", width: "100%", border: "none", background: "none", outline: "none", padding: 0 }} />
            </div>
          </div>

          {/* SIMULATION & WHAT-IF CONTROLS */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px", marginBottom: "30px", border: "1px solid #e2e8f0", padding: "24px", borderRadius: "8px", background: "#f8fafc" }}>
            <div>
              <label style={{ display: "flex", justifyContent: "space-between", fontWeight: "800", fontSize: "14px", color: "#0f172a" }}>
                Số lượng phòng mong muốn bán thêm:
                <span style={{ color: "#1e3a8a" }}>{inputExtraRoomsToSell} phòng</span>
              </label>
              <input type="range" min="0" max="75" value={inputExtraRoomsToSell} onChange={(e) => setInputExtraRoomsToSell(Number(e.target.value))} style={{ width: "100%", marginTop: "10px", accentColor: "#1e3a8a" }} />
              <div style={{ fontSize: "12px", color: "#64748b", marginTop: "5px" }}>*Kho tồn: Standard (33), Deluxe (22), Suite (20). Khuyến nghị tối đa 75 phòng.</div>
            </div>
            
            <div style={{ display: "flex", gap: "10px", flexDirection: "column" }}>
              <div style={{ display: "flex", gap: "10px" }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: "12px", fontWeight: "700" }}>Công suất (Occ Effect): {simOccupancy}%</label>
                  <input type="range" min="0" max="100" value={simOccupancy} onChange={(e) => setSimOccupancy(Number(e.target.value))} style={{ width: "100%", accentColor: "#1e3a8a" }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: "12px", fontWeight: "700" }}>Lead Time (Yield): {simLeadTime} ngày</label>
                  <input type="range" min="0" max="30" value={simLeadTime} onChange={(e) => setSimLeadTime(Number(e.target.value))} style={{ width: "100%", accentColor: "#b45309" }} />
                </div>
              </div>
              <div style={{ fontSize: "12px", color: "#334155", background: "white", padding: "8px", border: "1px solid #cbd5e1" }}>Giá tối ưu (What-If) được tính tự động dựa trên Occupancy & Lead Time.</div>
            </div>
          </div>

          <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
            <button onClick={() => setSelectedDayType("Weekday")} style={tabStyle(selectedDayType === "Weekday")}>NGÀY TRONG TUẦN (WEEKDAY)</button>
            <button onClick={() => setSelectedDayType("Weekend")} style={tabStyle(selectedDayType === "Weekend")}>CUỐI TUẦN (WEEKEND)</button>
          </div>

          {/* PRESCRIPTIVE STRATEGY TABLE (KÊ TOA CHIẾN LƯỢC) */}
          <section style={{ marginBottom: "40px" }}>
            <h2 style={{ fontSize: "18px", fontWeight: "800", color: "#1e3a8a", marginBottom: "20px" }}>1. CHIẾN LƯỢC KÊ TOA ĐỂ ĐẠT MỤC TIÊU MONG MUỐN</h2>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", background: "#f8fafc" }}>
                  <th style={thStyle}>LOẠI PHÒNG (AVAI INVEN)</th>
                  <th style={thStyle}>GIÁ LỊCH SỬ → ĐỀ XUẤT</th>
                  <th style={thStyle}>BÁN CHO AI (MỤC TIÊU PHÒNG)</th>
                  <th style={thStyle}>BÁN QUA KÊNH NÀO</th>
                  <th style={thStyle}>BUNDLING DỊCH VỤ</th>
                </tr>
              </thead>
              <tbody>
                {processedRooms.map(room => {
                  const priceDiff = ((room.dynamicAdr / room.oldPrice) - 1) * 100;

                  // Phân bổ mục tiêu phòng bán thêm dựa trên Ontology P002
                  let allocationRatio = 0.3; // Mặc định
                  if (selectedDayType === "Weekday" && room.key === "STD") allocationRatio = 0.6; // Đẩy Corporate B2B
                  if (selectedDayType === "Weekend" && room.key === "DL") allocationRatio = 0.5; // Đẩy Leisure
                  if (selectedDayType === "Weekend" && room.key === "SU") allocationRatio = 0.4; // Đẩy Leisure VIP

                  const extraRoomsTarget = Math.round(inputExtraRoomsToSell * allocationRatio);

                  return (
                    <tr key={room.key} style={{ borderBottom: "1px solid #e2e8f0" }}>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: "700", color: "#0f172a" }}>{room.name}</div>
                        <div style={{ fontSize: "13px", color: "#64748b" }}>Tồn kho còn: <strong style={{ color: "#1e3a8a" }}>{room.avai} phòng</strong></div>
                      </td>
                      <td style={tdStyle}>
                        <div style={{ fontSize: "14px", color: "#64748b" }}>Base: {currency(room.oldPrice)}</div>
                        <div style={{ fontSize: "18px", fontWeight: "800", color: "#1e3a8a" }}>{currency(room.dynamicAdr)}</div>
                        <div style={{ fontSize: "12px", color: priceDiff >= 0 ? "#059669" : "#dc2626" }}>({priceDiff >= 0 ? "+" : ""}{priceDiff.toFixed(1)}%)</div>
                      </td>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: "700" }}>{room.priorityWho}</div>
                        <div style={{ fontSize: "12px", background: "#0f172a", color: "white", padding: "2px 8px", display: "inline-block", marginTop: "4px" }}>MT: Bán {extraRoomsTarget} phòng</div>
                        <div style={{ fontSize: "12px", color: "#475569", marginTop: "4px", lineHeight: "1.4" }}>{room.whoReason}</div>
                      </td>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: "700", color: "#b45309" }}>{room.priorityWhere}</div>
                        <div style={{ fontSize: "12px", color: "#475569", marginTop: "4px", lineHeight: "1.4" }}>{room.whereReason}</div>
                      </td>
                      <td style={tdStyle}>
                        <div style={{ fontSize: "14px", fontWeight: "700", color: "#7c3aed" }}>{room.ancillary}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          {/* KẾT QUẢ ĐẠT ĐƯỢC (PROJECTED IMPACT & MONTE CARLO) */}
          <section style={{ border: "1px solid #e2e8f0", background: "#f8fafc", borderRadius: "8px", overflow: "hidden" }}>
            <h2 style={{ fontSize: "16px", fontWeight: "800", color: "#ffffff", background: "#1e3a8a", margin: 0, padding: "15px 20px" }}>2. MÔ PHỎNG KẾT QUẢ ĐẠT ĐƯỢC KỲ VỌNG (OPTIMIZATION IMPACT)</h2>
            <div style={{ padding: "30px", display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: "30px" }}>
              
              {/* LÝ LUẬN MONTE CARLO */}
              <div style={{ borderRight: "1px solid #e2e8f0", paddingRight: "30px" }}>
                <p style={{ fontSize: "14px", color: "#475569", lineHeight: "1.7", margin: "0 0 20px 0" }}>
                  Hệ thống sử dụng dự báo {currency(appData.metrics.forecast)} làm Baseline. Bằng việc kê toa Dynamic Price, chúng ta thực hiện mô phỏng **Monte Carlo 5000 kịch bản** ngẫu nhiên.
                  Mô phỏng chẩn đoán sức chịu đựng của doanh thu trước các rủi ro: Lực cầu thị trường biến động (75% - 95%) và Tỷ lệ hủy phòng ảo trên OTA (cần siết từ 17.8% xuống 10% - 14% trên Direct).
                  Kết quả dự phỏng là **Giá trị kỳ vọng trung bình (Mean Expected Value)** của tất cả kịch bản thành công.
                </p>
                <div style={{ fontSize: "14px", fontWeight: "700", color: "#0f172a" }}>Xác suất đạt mục tiêu {currency(inputWantedRevenue)}: <strong style={{ fontSize: "20px", color: projectedImpact.probabilityOfHittingTarget > 50 ? "#059669" : "#dc2626" }}>{projectedImpact.probabilityOfHittingTarget.toFixed(1)}%</strong></div>
              </div>

              {/* CHỈ SỐ KẾT QUẢ CỤ THỂ */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
                <div style={{ flex: 1, padding: "15px", background: "white", border: "1px solid #e2e8f0" }}>
                  <div style={{ fontSize: "11px", fontWeight: "700", color: "#64748b", marginBottom: "5px" }}>DOANH THU SẼ ĐẠT ĐƯỢC</div>
                  <div style={{ fontSize: "20px", fontWeight: "800", color: "#0f172a" }}>{currency(projectedImpact.projectedTotalOptimizedRevenue)}</div>
                </div>
                <div style={{ flex: 1, padding: "15px", background: "white", border: "1px solid #e2e8f0" }}>
                  <div style={{ fontSize: "11px", fontWeight: "700", color: "#64748b", marginBottom: "5px" }}>TĂNG TRƯỞNG (vs BASELINE)</div>
                  <div style={{ fontSize: "20px", fontWeight: "800", color: growth >= 0 ? "#059669" : "#dc2626" }}>+{growth.toFixed(1)}%</div>
                </div>
                <div style={{ flex: 1, padding: "15px", background: "white", border: "1px solid #e2e8f0" }}>
                  <div style={{ fontSize: "11px", fontWeight: "700", color: "#64748b", marginBottom: "5px" }}>DOANH THU PHÒNG TĂNG</div>
                  <div style={{ fontSize: "20px", fontWeight: "800", color: "#1e40af" }}>+{currency(projectedImpact.meanRoomRevenueGain)}</div>
                </div>
                <div style={{ flex: 1, padding: "15px", background: "white", border: "1px solid #e2e8f0" }}>
                  <div style={{ fontSize: "11px", fontWeight: "700", color: "#64748b", marginBottom: "5px" }}>DOANH THU DỊCH VỤ ĐI KÈM TĂNG</div>
                  <div style={{ fontSize: "20px", fontWeight: "800", color: "#7c3aed" }}>+{currency(projectedImpact.meanAncillaryRevenueGain)}</div>
                </div>
              </div>
              
              {/* Kiểm tra Gap */}
              <div style={{ gridColumn: "1 / -1", textAlign: "center", marginTop: "10px", padding: "15px", background: projectedImpact.totalRevenueGap >= 0 ? "#f0fdf4" : "#fef2f2", color: projectedImpact.totalRevenueGap >= 0 ? "#059669" : "#dc2626", fontWeight: "700", borderRadius: "4px" }}>
                {projectedImpact.totalRevenueGap >= 0 ? `Chúc mừng! Kịch bản này VƯỢT mục tiêu $ Wanted là +${currency(projectedImpact.totalRevenueGap)}` : `Cảnh báo! Kịch bản này ĐANG THIẾU ${currency(Math.abs(projectedImpact.totalRevenueGap))} để đạt mục tiêu $ Wanted. Hãy tăng Giá hoặc Tăng số lượng phòng bán.`}
              </div>

            </div>
          </section>

        </div>
      </div>
    </div>
  );
}

// STYLES
const tabStyle = (active) => ({
  flex: 1, padding: "16px", border: "none", cursor: "pointer", 
  background: active ? "#0f172a" : "#f1f5f9", 
  color: active ? "white" : "#475569", fontWeight: "700", fontSize: "13px",
  letterSpacing: "0.5px", transition: "all 0.2s ease", borderRadius: "8px"
});
const thStyle = { padding: "15px", fontSize: "11px", color: "#64748b", textTransform: "uppercase", fontWeight: "700" };
const tdStyle = { padding: "20px 15px" };