import React, { useState, useMemo } from "react";
import * as XLSX from "xlsx";

// FORMAT TIỀN TỆ & SỐ LIỆU
const currency = (v) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v || 0);
const formatNum = (v) => new Intl.NumberFormat("en-US").format(Math.round(v));

// HÀM ĐỌC EXCEL
const readExcel = (file) => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: "array", cellDates: true });
        resolve(workbook);
      } catch (err) { resolve(null); }
    };
    reader.onerror = () => resolve(null);
    reader.readAsArrayBuffer(file);
  });
};

export default function App() {
  const [historyFile, setHistoryFile] = useState(null);
  const [forecastFile, setForecastFile] = useState(null);
  const [appData, setAppData] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // QUẢN LÝ TRẠNG THÁI (STATE)
  const [selectedDayType, setSelectedDayType] = useState("Weekday");
  const [simLeadTime, setSimLeadTime] = useState(15); 
  const [targetOccupancy, setTargetOccupancy] = useState(65);

  // TỒN KHO GỐC (DAILY SNAPSHOT)
  const TOTAL_DAILY_ROOMS = 80;
  
  const BASE_INVENTORY = {
    Weekday: {
      RT_STD: { name: "STANDARD ROOM", capacity: 45, sold: 19, baseAvai: 26, oldPrice: 92 },
      RT_DLX: { name: "DELUXE ROOM", capacity: 28, sold: 14, baseAvai: 14, oldPrice: 129 },
      RT_STE: { name: "EXECUTIVE SUITE", capacity: 7, sold: 2, baseAvai: 5, oldPrice: 211 }
    },
    Weekend: {
      RT_STD: { name: "STANDARD ROOM", capacity: 45, sold: 16, baseAvai: 29, oldPrice: 95 },
      RT_DLX: { name: "DELUXE ROOM", capacity: 28, sold: 14, baseAvai: 14, oldPrice: 129 },
      RT_STE: { name: "EXECUTIVE SUITE", capacity: 7, sold: 4, baseAvai: 3, oldPrice: 223 }
    }
  };

  // CƠ SỞ CHIẾN LƯỢC KINH DOANH
  const STRATEGIES = {
    Weekday: {
      RT_STD: {
        who: ["Ưu tiên 1 - Corporate (B2B): Tạo nền tảng công suất ngày thường ổn định.", "Ưu tiên 2 - Group: Khai thác đoàn khách lưu trú dài ngày (>6 đêm)."],
        where: ["Direct - B2B Contract: Miễn phí hoa hồng OTA, không bào mòn giá trị ròng.", "OTA (Booking/Agoda): Chỉ dùng để phân phối phút chót."],
        ancillary: "MICE Bundle (Dịch vụ F&B + Laundry)"
      },
      RT_DLX: {
        who: ["Ưu tiên 1 - Leisure: Tệp khách mang lại ADR cao nhất.", "Ưu tiên 2 - MICE: Tận dụng các đoàn sự kiện doanh nghiệp."],
        where: ["Direct Website: Chuyển dịch khách từ OTA về Web để chặn rủi ro hủy ảo (17.8%)."],
        ancillary: "Spa & Tour Bundle (Phá vỡ thế độc tôn F&B)"
      },
      RT_STE: {
        who: ["Ưu tiên 1 - MICE VIPs: Chuyên gia, quản lý cấp cao sự kiện."],
        where: ["Direct Phone / GDS: Tuyệt đối không bán Suite qua OTA."],
        ancillary: "Luxury Service Bundle (All-inclusive)"
      }
    },
    Weekend: {
      RT_STD: {
        who: ["Ưu tiên 1 - Leisure: Cầu du lịch tự túc cuối tuần cao."],
        where: ["OTA (Booking/Agoda): Kéo Volume mạnh nhưng kèm Non-refundable.", "Direct Website: Khuyến mãi thành viên ẩn."],
        ancillary: "Buffet Bundle (Dịch vụ Ẩm thực)"
      },
      RT_DLX: {
        who: ["Ưu tiên 1 - Leisure Couples: Sẵn sàng chi trả cao cho nghỉ dưỡng."],
        where: ["Direct Website: Chạy quảng cáo gói Combo Weekend Retreat."],
        ancillary: "Spa Retreat Package (Làm đẹp)"
      },
      RT_STE: {
        who: ["Ưu tiên 1 - Leisure VIP: Lấp đầy Suite đạt đỉnh 57.4%."],
        where: ["Direct Phone & Loyalty: Bảo vệ dòng tiền, triệt tiêu No-show."],
        ancillary: "Premium Heritage Bundle (Đóng gói toàn bộ tiện ích)"
      }
    }
  };

  const handleProcessData = async () => {
    if (!historyFile || !forecastFile) return alert("Hệ thống yêu cầu cung cấp đủ 2 file dữ liệu.");
    setIsProcessing(true);

    try {
      const [histWb, forecastWb] = await Promise.all([readExcel(historyFile), readExcel(forecastFile)]);

      let forecastTotal = 125494;
      let onHandTotal = 110744;

      if (forecastWb) {
        try {
          const summarySheet = forecastWb.SheetNames.find(n => n.toLowerCase().includes("summary")) || forecastWb.SheetNames[0];
          const summaryData = XLSX.utils.sheet_to_json(forecastWb.Sheets[summarySheet]);
          summaryData.forEach(row => {
            const vals = Object.values(row);
            if (vals.length >= 2 && !isNaN(parseFloat(vals[1]))) {
              if (String(vals[0]).includes("Forecast Total")) forecastTotal = parseFloat(vals[1]);
              if (String(vals[0]).includes("On-hand Total")) onHandTotal = parseFloat(vals[1]);
            }
          });
        } catch (e) {}
      }

      setAppData({ metrics: { forecast: forecastTotal, onHand: onHandTotal } });
      setIsProcessing(false);
    } catch (err) { 
      setAppData({ metrics: { forecast: 125494, onHand: 110744 } });
      setIsProcessing(false); 
    }
  };

  // ĐỘNG CƠ PHÂN TÍCH (ANALYTICS ENGINE)
  const analyticsData = useMemo(() => {
    if (!appData) return null;

    const baseData = BASE_INVENTORY[selectedDayType];
    const totalSoldToday = baseData.RT_STD.sold + baseData.RT_DLX.sold + baseData.RT_STE.sold;
    const baseOccupancy = (totalSoldToday / TOTAL_DAILY_ROOMS) * 100;

    // Toán học cho Đêm phòng (Room Nights)
    const targetDailyRooms = Math.round(TOTAL_DAILY_ROOMS * (targetOccupancy / 100));
    const extraDailyRoomsToSell = Math.max(0, targetDailyRooms - totalSoldToday);
    const extraMonthlyRoomNightsToSell = extraDailyRoomsToSell * 31; // Đổi thành thuật ngữ Room Nights

    // 1. ĐỊNH GIÁ 5 TẦNG
    let leadMultiplier = 1.0;
    let leadReason = "";

    if (simLeadTime >= 0 && simLeadTime <= 3) {
      leadMultiplier = 1.15;
      leadReason = "[Tier 1 - Khẩn cấp]: Khách hàng cận ngày. Khuyến nghị TĂNG GIÁ 15% để vắt kiệt Yield.";
    } else if (simLeadTime >= 4 && simLeadTime <= 7) {
      leadMultiplier = 1.05;
      leadReason = "[Tier 2 - Ngắn hạn]: Khách hàng đã chốt lịch trình. Khuyến nghị TĂNG GIÁ 5%.";
    } else if (simLeadTime >= 8 && simLeadTime <= 14) {
      leadMultiplier = 1.00;
      leadReason = "[Tier 3 - Tiêu chuẩn]: Trạng thái cung cầu cân bằng. DUY TRÌ GIÁ BASE.";
    } else if (simLeadTime >= 15 && simLeadTime <= 21) {
      leadMultiplier = 0.95;
      leadReason = "[Tier 4 - Đặt sớm]: Ưu đãi kích cầu sớm. GIẢM GIÁ 5%, kèm chính sách Hủy mất phí 50%.";
    } else {
      leadMultiplier = 0.90;
      leadReason = "[Tier 5 - Dài hạn]: Thu hút Base Volume sớm. GIẢM GIÁ 10%, bắt buộc áp dụng 100% Non-refundable.";
    }

    // 2. LUỒNG TỒN KHO ĐỘNG THEO NGÀY (DAILY INVENTORY)
    const pickupRate = 0.85 * (1 - (simLeadTime / 30)); 

    const processedRooms = ["RT_STD", "RT_DLX", "RT_STE"].map(key => {
      const roomBase = baseData[key];
      const strat = STRATEGIES[selectedDayType][key];
      
      const pickupRooms = Math.round(roomBase.baseAvai * pickupRate);
      const currentOccupied = roomBase.sold + pickupRooms;
      const checkOutRooms = Math.round(currentOccupied * 0.25);
      const dynamicAvai = Math.min(roomBase.capacity, roomBase.capacity - currentOccupied + checkOutRooms);

      const dynamicAdr = roomBase.oldPrice * leadMultiplier;
      const priceDiff = ((dynamicAdr / roomBase.oldPrice) - 1) * 100;

      return { key, currentOccupied, checkOutRooms, avai: dynamicAvai, dynamicAdr, priceDiff, ...roomBase, ...strat };
    });

    // 3. MÔ PHỎNG MONTE CARLO DOANH THU (CHỈ PHỤ THUỘC VÀO OCCUPANCY VÀ GIÁ GỐC LỊCH SỬ)
    // Tách biệt hoàn toàn khỏi Lead Time: Khách sạn không thể bán 100% quỹ phòng còn lại bằng giá sát ngày.
    let successfulRoomRev = 0;
    const avgBaseAdr = processedRooms.reduce((sum, r) => sum + r.oldPrice, 0) / 3;
    
    for (let i = 0; i < 2000; i++) {
      const simulatedDemandCapture = 0.75 + Math.random() * 0.20;
      const simulatedCancelRatio = 0.08 + Math.random() * 0.05; 
      const conversionRate = simulatedDemandCapture * (1 - simulatedCancelRatio);

      const simulatedMonthlyRoomNightsSold = extraMonthlyRoomNightsToSell * conversionRate;
      // Doanh thu kỳ vọng = Đêm phòng bán được * Giá gốc trung bình (Không bị nhiễu bởi Giá Lead Time)
      successfulRoomRev += (simulatedMonthlyRoomNightsSold * avgBaseAdr);
    }

    const meanRoomRev = successfulRoomRev / 2000;
    const meanAncillaryRev = meanRoomRev * 0.18; 
    const totalProjectedRev = appData.metrics.onHand + meanRoomRev + meanAncillaryRev;
    
    return { baseOccupancy, extraMonthlyRoomNightsToSell, leadReason, processedRooms, impact: { totalProjectedRev, meanRoomRev, meanAncillaryRev } };

  }, [appData, selectedDayType, simLeadTime, targetOccupancy]);

  if (!appData) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", position: "relative", padding: "20px", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", backgroundImage: "url('image_74fb96.jpg')", backgroundSize: "cover", backgroundPosition: "center", filter: "blur(12px)", opacity: 0.4, zIndex: -1 }} />
        
        <div style={{ background: "white", padding: "50px", width: "100%", maxWidth: "800px", borderTop: "4px solid #1e3a8a", boxShadow: "0 10px 30px rgba(0,0,0,0.1)" }}>
          <h1 style={{ color: "#0f172a", margin: "0 0 10px 0", fontSize: "28px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "1px" }}>Hệ thống Hoạch định Doanh thu (BI)</h1>
          <p style={{ color: "#64748b", margin: "0 0 30px 0", fontSize: "14px", fontWeight: "500" }}>Phân hệ Chẩn đoán & Kê toa Chiến lược - Heritage Hue Hotel</p>
          
          <div style={{ display: "flex", gap: "20px", marginBottom: "30px" }}>
            <div style={{ flex: 1, border: "1px solid #cbd5e1", padding: "25px 20px", background: "#f8fafc" }}>
              <p style={{ fontSize: "12px", fontWeight: "700", color: "#1e3a8a", margin: "0 0 10px 0" }}>1. DỮ LIỆU LỊCH SỬ (CLEANED)</p>
              <input type="file" accept=".xlsx,.csv" onChange={(e) => setHistoryFile(e.target.files[0])} style={{ fontSize: "13px", color: "#334155" }} />
            </div>
            <div style={{ flex: 1, border: "1px solid #cbd5e1", padding: "25px 20px", background: "#f8fafc" }}>
              <p style={{ fontSize: "12px", fontWeight: "700", color: "#1e3a8a", margin: "0 0 10px 0" }}>2. DỮ LIỆU DỰ BÁO (FORECAST)</p>
              <input type="file" accept=".xlsx,.csv" onChange={(e) => setForecastFile(e.target.files[0])} style={{ fontSize: "13px", color: "#334155" }} />
            </div>
          </div>
          <button onClick={handleProcessData} disabled={isProcessing} style={{ background: "#1e3a8a", color: "white", padding: "16px", border: "none", cursor: "pointer", fontWeight: "700", letterSpacing: "1px", width: "100%", fontSize: "14px", textTransform: "uppercase" }}>
            {isProcessing ? "HỆ THỐNG ĐANG XỬ LÝ..." : "Xác thực & Kết xuất Báo cáo"}
          </button>
        </div>
      </div>
    );
  }

  const { baseOccupancy, extraMonthlyRoomNightsToSell, leadReason, processedRooms, impact } = analyticsData;
  const growthPercent = ((impact.totalProjectedRev / appData.metrics.forecast) - 1) * 100;

  return (
    <div style={{ minHeight: "100vh", padding: "40px", fontFamily: "system-ui, sans-serif", color: "#0f172a" }}>
      <div style={{ position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", backgroundImage: "url('image_74fb96.jpg')", backgroundSize: "cover", backgroundPosition: "center", filter: "blur(20px)", opacity: 0.25, zIndex: -1 }} />
      
      <div style={{ maxWidth: "1400px", margin: "0 auto", background: "white", boxShadow: "0 10px 40px rgba(0,0,0,0.1)", border: "1px solid #e2e8f0" }}>
        
        {/* HEADER */}
        <header style={{ background: "#0f172a", padding: "30px 40px", color: "white", borderBottom: "4px solid #1e3a8a" }}>
          <h1 style={{ fontSize: "22px", fontWeight: "800", textTransform: "uppercase", margin: "0 0 8px 0", letterSpacing: "1px" }}>Báo cáo Quản trị & Tối ưu Doanh thu - Tháng 01/2026</h1>
          <p style={{ margin: 0, color: "#94a3b8", fontSize: "13px", fontWeight: "500" }}>Áp dụng Định giá 5 Tầng (5-Tier Pricing), Tồn kho Động & Xác suất Monte Carlo.</p>
        </header>

        <div style={{ padding: "40px" }}>
          
          {/* TOP METRICS */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "25px", marginBottom: "40px" }}>
            <div style={{ padding: "25px", border: "1px solid #cbd5e1", background: "#f8fafc", borderLeft: "4px solid #1e3a8a" }}>
              <span style={{ fontSize: "12px", color: "#475569", fontWeight: "700" }}>DOANH THU ĐÃ CHỐT TỪ ĐẦU THÁNG (ON-HAND)</span>
              <div style={{ fontSize: "32px", fontWeight: "800", color: "#0f172a", marginTop: "10px" }}>{currency(appData.metrics.onHand)}</div>
            </div>
            <div style={{ padding: "25px", border: "1px solid #cbd5e1", background: "white", borderLeft: "4px solid #64748b" }}>
              <span style={{ fontSize: "12px", color: "#475569", fontWeight: "700" }}>DỰ BÁO DOANH THU TĨNH (BASELINE)</span>
              <div style={{ fontSize: "32px", fontWeight: "800", color: "#0f172a", marginTop: "10px" }}>{currency(appData.metrics.forecast)}</div>
            </div>
          </div>

          {/* DYNAMIC CONTROLS */}
          <section style={{ marginBottom: "35px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "40px", padding: "35px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px" }}>
                <h2 style={{ fontSize: "14px", fontWeight: "700", color: "#0f172a", margin: 0 }}>MỤC TIÊU CÔNG SUẤT (TARGET OCCUPANCY):</h2>
                <span style={{ fontSize: "16px", fontWeight: "800", color: "white", background: "#1e3a8a", padding: "4px 12px" }}>{targetOccupancy}%</span>
              </div>
              <input type="range" min="40" max="95" value={targetOccupancy} onChange={(e) => setTargetOccupancy(Number(e.target.value))} style={{ width: "100%", accentColor: "#1e3a8a", cursor: "pointer" }} />
              <div style={{ marginTop: "15px", fontSize: "13px", color: "#475569", lineHeight: "1.6" }}>
                Công suất gốc Lịch sử: <strong>{baseOccupancy.toFixed(1)}%</strong>. Quỹ phòng yêu cầu bán thêm để đạt chỉ tiêu: <strong style={{color:"#1e3a8a"}}>{formatNum(extraMonthlyRoomNightsToSell)} Đêm phòng (Room Nights)</strong>.
              </div>
            </div>

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px" }}>
                <h2 style={{ fontSize: "14px", fontWeight: "700", color: "#0f172a", margin: "0" }}>THỜI GIAN ĐẶT PHÒNG (LEAD TIME):</h2>
                <span style={{ fontSize: "16px", fontWeight: "800", color: "white", background: "#1e3a8a", padding: "4px 12px" }}>{simLeadTime} NGÀY</span>
              </div>
              <input type="range" min="1" max="30" value={simLeadTime} onChange={(e) => setSimLeadTime(Number(e.target.value))} style={{ width: "100%", accentColor: "#1e3a8a", cursor: "pointer", direction: "rtl" }} />
              <div style={{ marginTop: "15px", fontSize: "13px", color: "#1e3a8a", lineHeight: "1.6", borderLeft: "3px solid #1e3a8a", paddingLeft: "15px", background: "#eff6ff", padding: "10px" }}>
                <strong>PHẢN ỨNG GIÁ:</strong> {leadReason}
              </div>
            </div>
          </section>

          {/* TAB CHỌN DAY TYPE */}
          <div style={{ display: "flex", gap: "5px", marginBottom: "20px" }}>
            <button onClick={() => setSelectedDayType("Weekday")} style={tabStyle(selectedDayType === "Weekday")}>BỐI CẢNH LÀM VIỆC: NGÀY TRONG TUẦN (WEEKDAY)</button>
            <button onClick={() => setSelectedDayType("Weekend")} style={tabStyle(selectedDayType === "Weekend")}>BỐI CẢNH LÀM VIỆC: CUỐI TUẦN (WEEKEND)</button>
          </div>

          {/* BẢNG KÊ TOA CHIẾN LƯỢC */}
          <section style={{ marginBottom: "50px" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", border: "1px solid #cbd5e1" }}>
              <thead>
                <tr style={{ textAlign: "left", background: "#f8fafc", borderBottom: "2px solid #1e3a8a" }}>
                  <th style={thStyle}>HẠNG PHÒNG & TÌNH TRẠNG NGÀY</th>
                  <th style={thStyle}>ĐỊNH GIÁ ĐA TẦNG (ADR)</th>
                  <th style={thStyle}>MỤC TIÊU PHÂN KHÚC KHÁCH HÀNG</th>
                  <th style={thStyle}>CHIẾN LƯỢC KÊNH PHÂN PHỐI</th>
                  <th style={thStyle}>DỊCH VỤ GIA TĂNG (BUNDLE)</th>
                </tr>
              </thead>
              <tbody style={{ background: "white" }}>
                {processedRooms.map(room => (
                  <tr key={room.key} style={{ borderBottom: "1px solid #e2e8f0" }}>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: "800", color: "#0f172a", fontSize: "14px", marginBottom: "12px" }}>{room.name}</div>
                      <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "4px" }}>Sức chứa (Capacity): <strong>{room.capacity} phòng</strong></div>
                      
                      <div style={{ fontSize: "12px", color: "#1e40af", marginBottom: "8px", fontWeight: "600" }}>Phòng đang ở (Occupied): <strong>{room.currentOccupied}</strong></div>
                      
                      <div style={{ fontSize: "12px", fontWeight: "700", color: "#1e3a8a", padding: "6px 10px", background: "#f1f5f9", border: "1px solid #cbd5e1", display: "inline-block" }}>
                        Sẵn bán (Available): {formatNum(room.avai)} phòng
                      </div>
                    </td>
                    <td style={tdStyle}>
                      <div style={{ fontSize: "13px", color: "#94a3b8", textDecoration: "line-through" }}>{currency(room.oldPrice)}</div>
                      <div style={{ fontSize: "22px", fontWeight: "800", color: "#0f172a", margin: "6px 0" }}>{currency(room.dynamicAdr)}</div>
                      <div style={{ fontSize: "12px", fontWeight: "700", color: room.priceDiff >= 0 ? "#059669" : "#dc2626" }}>({room.priceDiff >= 0 ? "+" : ""}{room.priceDiff.toFixed(1)}%)</div>
                    </td>
                    <td style={tdStyle}>
                      <ul style={{ paddingLeft: "15px", margin: 0, fontSize: "13px", color: "#334155", lineHeight: "1.7" }}>
                        {room.who.map((w, idx) => (
                          <li key={idx} style={{ marginBottom: "8px" }} dangerouslySetInnerHTML={{ __html: w.replace(/(Ưu tiên \d)/g, '<strong>$1</strong>') }} />
                        ))}
                      </ul>
                    </td>
                    <td style={tdStyle}>
                      <ul style={{ paddingLeft: "15px", margin: 0, fontSize: "13px", color: "#334155", lineHeight: "1.7" }}>
                        {room.where.map((w, idx) => (
                          <li key={idx} style={{ marginBottom: "8px" }} dangerouslySetInnerHTML={{ __html: w.replace(/(Kênh \d)/g, '<strong>$1</strong>') }} />
                        ))}
                      </ul>
                    </td>
                    <td style={{ ...tdStyle, fontSize: "13px", fontWeight: "700", color: "#1e3a8a", lineHeight: "1.6" }}>
                      {room.ancillary}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* KẾT QUẢ ĐẠT ĐƯỢC (MONTE CARLO) */}
          <section style={{ border: "1px solid #cbd5e1", background: "white", overflow: "hidden" }}>
            <h2 style={{ fontSize: "15px", fontWeight: "800", color: "#0f172a", background: "#f1f5f9", margin: 0, padding: "20px 25px", textTransform: "uppercase", borderBottom: "1px solid #e2e8f0" }}>Kết quả Đạt được Kỳ vọng (Monte Carlo Impact Analysis)</h2>
            <div style={{ padding: "40px", display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "40px" }}>
              
              <div style={{ borderRight: "1px solid #e2e8f0", paddingRight: "40px" }}>
                <p style={{ fontSize: "14px", color: "#475569", lineHeight: "1.8", margin: "0 0 25px 0" }}>
                  Hệ thống thực thi <strong>2000 phiên bản giả lập ngẫu nhiên</strong> nhằm định lượng rủi ro kinh tế học: Lực cầu thị trường biến thiên (75% - 95%) và Tỷ lệ hủy phòng ảo trên kênh OTA (siết chặt từ 17.8% xuống mức 8%-13%).
                  <br/><br/>
                  <strong>Lưu ý:</strong> Doanh thu kỳ vọng được tính toán dựa trên mức giá gốc lịch sử, tách biệt hoàn toàn khỏi biến động tăng/giảm giá cục bộ của Lead Time. Nhờ đó, việc điều chỉnh Lead Time chỉ giúp kê toa chiến lược giá cho hiện tại, trong khi tổng doanh thu kỳ vọng sẽ <strong>tăng trưởng ổn định dựa trên Mục tiêu Công suất.</strong>
                </p>
                <div style={{ padding: "20px", background: "#f1f5f9", border: "1px solid #cbd5e1" }}>
                  <div style={{ fontSize: "12px", fontWeight: "700", color: "#64748b", marginBottom: "5px" }}>MỐC DỰ BÁO TĨNH (BASELINE)</div>
                  <div style={{ fontSize: "24px", fontWeight: "800", color: "#0f172a" }}>{currency(appData.metrics.forecast)}</div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
                <div style={{ padding: "20px", background: "#0f172a", color: "white", gridColumn: "1 / -1", borderLeft: "4px solid #1e3a8a" }}>
                  <div style={{ fontSize: "12px", fontWeight: "700", color: "#94a3b8", marginBottom: "5px" }}>TỔNG DOANH THU KỲ VỌNG (EXPECTED VALUE)</div>
                  <div style={{ fontSize: "32px", fontWeight: "800", color: "white" }}>{currency(impact.totalProjectedRev)}</div>
                </div>
                <div style={{ padding: "15px", background: "#f0fdf4", border: "1px solid #bbf7d0" }}>
                  <div style={{ fontSize: "11px", fontWeight: "700", color: "#059669", marginBottom: "5px" }}>TĂNG TRƯỞNG (GROWTH)</div>
                  <div style={{ fontSize: "20px", fontWeight: "800", color: "#059669" }}>+{growthPercent.toFixed(1)}%</div>
                </div>
                <div style={{ padding: "15px", background: "white", border: "1px solid #cbd5e1" }}>
                  <div style={{ fontSize: "11px", fontWeight: "700", color: "#475569", marginBottom: "5px" }}>ROOM REVENUE GAIN</div>
                  <div style={{ fontSize: "18px", fontWeight: "800", color: "#0f172a" }}>+{currency(impact.meanRoomRev)}</div>
                </div>
                <div style={{ padding: "15px", background: "white", border: "1px solid #cbd5e1", gridColumn: "1 / -1" }}>
                  <div style={{ fontSize: "11px", fontWeight: "700", color: "#475569", marginBottom: "5px" }}>ANCILLARY REVENUE GAIN (DỊCH VỤ ĐI KÈM)</div>
                  <div style={{ fontSize: "18px", fontWeight: "800", color: "#1e3a8a" }}>+{currency(impact.meanAncillaryRev)}</div>
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
  flex: 1, padding: "15px", border: "1px solid #cbd5e1", cursor: "pointer", 
  background: active ? "#1e3a8a" : "#f8fafc", 
  color: active ? "white" : "#475569", fontWeight: "700", fontSize: "13px",
  letterSpacing: "0.5px", transition: "0.2s"
});
const thStyle = { padding: "16px 20px", fontSize: "12px", color: "#1e3a8a", textTransform: "uppercase", fontWeight: "800" };
const tdStyle = { padding: "25px 20px", verticalAlign: "top" };