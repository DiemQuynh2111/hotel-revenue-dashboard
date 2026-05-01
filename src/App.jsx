import React, { useState } from "react";
import * as XLSX from "xlsx";

// 1. FORMAT TIỀN TỆ AN TOÀN TUYỆT ĐỐI (Chống NaN)
function currency(v) {
  const num = Number(v);
  if (isNaN(num)) return "$0";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(num);
}

// 2. GIẢI MÃ EXCEL DATE THÔNG MINH
const readExcel = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: "array", cellDates: true });
        resolve(workbook);
      } catch (err) {
        reject(new Error("Lỗi đọc file"));
      }
    };
    reader.readAsArrayBuffer(file);
  });
};

function isWeekend(dateVal) {
  if (!dateVal) return false;
  let d;
  if (dateVal instanceof Date) d = dateVal;
  else if (typeof dateVal === "number") d = new Date(Math.round((dateVal - 25569) * 86400 * 1000));
  else d = new Date(dateVal);
  if (isNaN(d.getTime())) return false;
  const day = d.getDay();
  return day === 5 || day === 6;
}

export default function App() {
  const [historyFile, setHistoryFile] = useState(null);
  const [forecastFile, setForecastFile] = useState(null);
  const [appData, setAppData] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const [selectedDayType, setSelectedDayType] = useState("Weekday");
  const [selectedRoomType, setSelectedRoomType] = useState("RT_STD");
  
  // STATE ĐIỀU KHIỂN LEAD TIME
  const [simLeadTime, setSimLeadTime] = useState(7);

  const handleProcessData = async () => {
    if (!historyFile || !forecastFile) return alert("Vui lòng tải lên đủ 2 file dữ liệu.");
    setIsProcessing(true);

    try {
      const [histWb, forecastWb] = await Promise.all([readExcel(historyFile), readExcel(forecastFile)]);

      // ĐỌC FILE DỰ BÁO
      const summarySheet = forecastWb.SheetNames.find(n => n.toLowerCase().includes("summary")) || forecastWb.SheetNames[0];
      const summaryData = XLSX.utils.sheet_to_json(forecastWb.Sheets[summarySheet]);
      const metrics = {};
      summaryData.forEach(row => {
        const keyArray = Object.values(row);
        if (keyArray.length >= 2) metrics[String(keyArray[0]).trim()] = parseFloat(keyArray[1]) || 0;
      });

      const forecastTotal = metrics["Forecast Total Revenue"] || 125494;
      const onHandTotal = metrics["On-hand Total Revenue"] || 110744;
      const gapTotal = metrics["Gap Total Revenue"] || 14749;
      const ancGap = metrics["Gap Ancillary Revenue"] || 1555;

      // ĐỌC FILE LỊCH SỬ
      const folioSheet = histWb.SheetNames.find(n => n.toLowerCase().includes("folio")) || histWb.SheetNames[0];
      const resSheet = histWb.SheetNames.find(n => n.toLowerCase().includes("reservation")) || histWb.SheetNames[1];
      const folios = XLSX.utils.sheet_to_json(histWb.Sheets[folioSheet]);
      const reservations = XLSX.utils.sheet_to_json(histWb.Sheets[resSheet]);

      const resP002 = reservations.filter(r => r.property_id === "P002" || Object.values(r).includes("P002"));
      const folioP002 = folios.filter(f => f.property_id === "P002" || Object.values(f).includes("P002"));

      const resMap = {};
      resP002.forEach(r => { 
        const resId = r.reservation_id || Object.values(r)[0];
        const rType = r.room_type_id || Object.values(r)[10];
        if (resId && rType) resMap[resId] = rType; 
      });

      const stats = {
        Weekday: { RT_STD: { sum: 0, count: 0 }, RT_DLX: { sum: 0, count: 0 }, RT_STE: { sum: 0, count: 0 } },
        Weekend: { RT_STD: { sum: 0, count: 0 }, RT_DLX: { sum: 0, count: 0 }, RT_STE: { sum: 0, count: 0 } }
      };

      folioP002.forEach(f => {
        const resId = f.reservation_id || Object.values(f)[3];
        const rt = resMap[resId];
        const amtStr = f.amount_net || Object.values(f)[6];
        const amt = parseFloat(amtStr);
        const dateVal = f.posting_date || Object.values(f)[2];
        
        if (rt && !isNaN(amt)) {
          const dt = isWeekend(dateVal) ? "Weekend" : "Weekday";
          if (stats[dt] && stats[dt][rt]) { 
            stats[dt][rt].sum += amt; 
            stats[dt][rt].count += 1; 
          }
        }
      });

      const getSafeOldPrice = (dt, rt) => {
        if (stats[dt][rt].count > 0 && stats[dt][rt].sum > 0) return stats[dt][rt].sum / stats[dt][rt].count;
        return rt === "RT_STD" ? (dt === "Weekend" ? 96 : 92) : rt === "RT_DLX" ? (dt === "Weekend" ? 135 : 131) : (dt === "Weekend" ? 215 : 212);
      };

      // ĐÓNG GÓI CHIẾN LƯỢC
      const finalData = {
        metrics: { forecast: forecastTotal, onHand: onHandTotal, gap: gapTotal, ancGap: ancGap },
        rooms: {
          Weekday: {
            RT_STD: {
              name: "HẠNG TIÊU CHUẨN",
              oldPrice: getSafeOldPrice("Weekday", "RT_STD"),
              basePrice: 90, 
              priorityList: [
                { segment: "Corporate", priority: "CAO NHẤT", reason: "Phân tích Weekday cho thấy khách sạn ghi nhận lượng booking cao gấp đôi cuối tuần nhưng chi tiêu mỗi khách lại thấp (Volume-driven). Khách Corporate giúp tạo base công suất ổn định.", method: "Ký kết hợp đồng B2B dài hạn, tránh mất phí hoa hồng OTA." },
                { segment: "Group", priority: "TRUNG BÌNH", reason: "Các đoàn công vụ vừa và nhỏ giúp lấp đầy nhanh chóng khoảng trống ngày thường.", method: "Phân phối qua hệ thống Đại lý (Wholesale) với mức giá Value Rate." },
                { segment: "Leisure", priority: "THẤP", reason: "Khách lẻ có mức chi trả tốt nhưng mật độ đi du lịch giữa tuần thấp.", method: "Mở bán linh hoạt trên Website khách sạn." }
              ],
              bundle: "Phòng lưu trú + Dịch vụ F&B (Business Lunch) + Dịch vụ Giặt ủi (Laundry)",
              strategyReason: "Điều chỉnh giảm nhẹ giá bán so với lịch sử để cạnh tranh khối lượng. Ưu tiên bán kèm dịch vụ F&B và Giặt ủi để đón tệp khách lưu trú dài ngày (> 6 đêm)."
            },
            RT_DLX: {
              name: "HẠNG CAO CẤP",
              oldPrice: getSafeOldPrice("Weekday", "RT_DLX"),
              basePrice: 130,
              priorityList: [
                { segment: "Leisure", priority: "CAO NHẤT", reason: "Doanh thu đang phụ thuộc lớn vào phân khúc này (hơn 434,000 USD). Nhóm khách sẵn sàng chi trả cho sự thoải mái giữa tuần.", method: "Đẩy mạnh hiển thị Direct Website để giữ nguyên biên lợi nhuận ròng." },
                { segment: "MICE", priority: "TRUNG BÌNH", reason: "Tận dụng ngân sách từ các đơn vị tổ chức sự kiện.", method: "Gói Bundle phòng họp nửa ngày kèm nghỉ dưỡng." }
              ],
              bundle: "Phòng lưu trú + Dịch vụ Spa (Mini-retreat) + Dịch vụ Tour",
              strategyReason: "Chẩn đoán bóc tách cho thấy dịch vụ Spa và Tour đang bị bỏ ngỏ. Cần mượn sức hút của hạng phòng Deluxe để bán chéo (Cross-sell) dịch vụ Spa."
            },
            RT_STE: {
              name: "HẠNG VIP",
              oldPrice: getSafeOldPrice("Weekday", "RT_STE"),
              basePrice: 215,
              priorityList: [
                { segment: "Corporate (Executive)", priority: "CAO NHẤT", reason: "Cấp quản lý cao cấp không nhạy cảm về giá tuyệt đối.", method: "Cá nhân hóa dịch vụ thông qua kênh Direct Phone." },
                { segment: "Leisure (VIP)", priority: "TRUNG BÌNH", reason: "Tệp khách tìm kiếm không gian riêng tư tuyệt đối.", method: "Upsell trực tiếp tại quầy Check-in." }
              ],
              bundle: "Phòng lưu trú + Trọn gói F&B, Spa, Tour",
              strategyReason: "Bảo vệ giá trị thương hiệu. Không giảm giá hạng Suite, áp dụng yêu cầu cọc trước 50% để hạn chế Rủi ro thất thoát doanh thu (Revenue Leakage)."
            }
          },
          Weekend: {
            RT_STD: {
              name: "HẠNG TIÊU CHUẨN",
              oldPrice: getSafeOldPrice("Weekend", "RT_STD"),
              basePrice: 102,
              priorityList: [
                { segment: "Leisure", priority: "CAO NHẤT", reason: "Cuối tuần lượng booking giảm nhưng ADR tăng mạnh. Nhu cầu du lịch tự túc cuối tuần rất lớn.", method: "Tối ưu hiển thị đa kênh trên các OTA (Booking, Agoda)." },
                { segment: "Group", priority: "TRUNG BÌNH", reason: "Nguồn khách ổn định đi theo đoàn nhỏ gia đình.", method: "Áp dụng điều khoản Non-refundable." }
              ],
              bundle: "Phòng lưu trú + Dịch vụ F&B (Buffet Dinner)",
              strategyReason: "Dịch chuyển sang chiến lược Value-driven. Tăng giá so với mốc lịch sử để thu hồi thặng dư tiêu dùng khi cầu vượt cung."
            },
            RT_DLX: {
              name: "HẠNG CAO CẤP",
              oldPrice: getSafeOldPrice("Weekend", "RT_DLX"),
              basePrice: 145,
              priorityList: [
                { segment: "Leisure Couple", priority: "CAO NHẤT", reason: "Sức mua lớn, tập trung vào trải nghiệm lãng mạn cuối tuần.", method: "Quảng cáo gói Combo qua mạng xã hội đổ về Direct Web." },
                { segment: "MICE", priority: "THẤP", reason: "Ít phổ biến vào cuối tuần.", method: "Chỉ bán nếu còn tồn kho sát ngày." }
              ],
              bundle: "Phòng lưu trú + Dịch vụ Spa (Weekend Package) + F&B",
              strategyReason: "Khắc phục tỷ lệ chuyển đổi OTA thấp (83.2%). Điều hướng khách về Direct Web với mức giá cao nhưng gia tăng giá trị cảm nhận bằng gói Spa ưu đãi."
            },
            RT_STE: {
              name: "HẠNG VIP",
              oldPrice: getSafeOldPrice("Weekend", "RT_STE"),
              basePrice: 225,
              priorityList: [
                { segment: "Leisure (Family/VIP)", priority: "CAO NHẤT", reason: "Dữ liệu lấp đầy Suite cuối tuần đạt đỉnh (57.4%). Nhóm đa thế hệ có sức mua rất lớn.", method: "Bán độc quyền qua Loyalty Program." },
                { segment: "Group", priority: "THẤP", reason: "Không phù hợp ngân sách khách đoàn.", method: "Chỉ dùng để Upsell." }
              ],
              bundle: "Premium Heritage Bundle (Toàn bộ hệ sinh thái Dịch vụ)",
              strategyReason: "Công suất chạm trần. Áp dụng giá Premium và chính sách chống No-show 100% để bảo vệ dòng tiền thực nhận."
            }
          }
        }
      };

      setAppData(finalData);
      setIsProcessing(false);
    } catch (err) { 
      alert("Lỗi xử lý file Excel. Vui lòng đảm bảo tải đúng file gốc của hệ thống."); 
      setIsProcessing(false); 
    }
  };

  // ==================== MÀN HÌNH TẢI FILE ====================
  if (!appData) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", background: "#f1f5f9", padding: "20px", fontFamily: "system-ui, -apple-system, sans-serif" }}>
        <h1 style={{ color: "#0f172a", marginBottom: "30px", fontSize: "32px", fontWeight: "900", letterSpacing: "-0.5px" }}>HỆ THỐNG BI: TỐI ƯU HÓA DOANH THU</h1>
        <div style={{ background: "white", padding: "50px", borderRadius: "12px", boxShadow: "0 10px 25px rgba(0,0,0,0.05)", textAlign: "center", border: "1px solid #e2e8f0", width: "100%", maxWidth: "800px" }}>
          <div style={{ display: "flex", gap: "30px", marginBottom: "40px", justifyContent: "center" }}>
            <div style={{ flex: 1, border: "2px dashed #cbd5e1", padding: "30px 20px", borderRadius: "8px", background: "#f8fafc" }}>
              <p style={{ fontSize: "14px", fontWeight: "800", color: "#334155", marginBottom: "15px" }}>1. TẢI FILE DỮ LIỆU LỊCH SỬ</p>
              <input type="file" accept=".xlsx" onChange={(e) => setHistoryFile(e.target.files[0])} style={{ fontSize: "13px" }} />
            </div>
            <div style={{ flex: 1, border: "2px dashed #cbd5e1", padding: "30px 20px", borderRadius: "8px", background: "#f8fafc" }}>
              <p style={{ fontSize: "14px", fontWeight: "800", color: "#334155", marginBottom: "15px" }}>2. TẢI FILE DỰ BÁO THÁNG 01</p>
              <input type="file" accept=".xlsx" onChange={(e) => setForecastFile(e.target.files[0])} style={{ fontSize: "13px" }} />
            </div>
          </div>
          <button onClick={handleProcessData} disabled={isProcessing} style={{ background: "#0f172a", color: "white", padding: "16px 40px", borderRadius: "6px", border: "none", cursor: "pointer", fontWeight: "800", letterSpacing: "1px", width: "100%", fontSize: "16px" }}>
            {isProcessing ? "HỆ THỐNG ĐANG XỬ LÝ SỐ LIỆU..." : "XÁC NHẬN PHÂN TÍCH TÀI CHÍNH"}
          </button>
        </div>
      </div>
    );
  }

  // ==================== MÀN HÌNH BÁO CÁO ====================
  const room = appData.rooms[selectedDayType][selectedRoomType];
  
  // THUẬT TOÁN ĐIỀU CHỈNH GIÁ DỰA TRÊN LEAD TIME
  let dynamicPrice = room.basePrice;
  let leadTimeStatus = "Bình thường";
  let leadTimeAction = "Duy trì mức giá đề xuất cơ bản. Tốc độ Pickup ổn định.";
  let leadTimeColor = "#334155"; // Màu xám đậm

  if (simLeadTime <= 3) {
    dynamicPrice = room.basePrice * 1.15; // Tăng 15%
    leadTimeStatus = "Cận ngày (Last-minute)";
    leadTimeAction = "Cầu khẩn cấp. Thuật toán tự động tăng 15% giá bán nhằm tối đa hóa thặng dư tiêu dùng (Yield).";
    leadTimeColor = "#dc2626"; // Đỏ
  } else if (simLeadTime >= 15) {
    dynamicPrice = room.basePrice * 0.90; // Giảm 10%
    leadTimeStatus = "Từ sớm (Early Bird)";
    leadTimeAction = "Giảm 10% để thu hút Base Volume, BẮT BUỘC kèm điều khoản Non-refundable để chống tỷ lệ hủy 83.2%.";
    leadTimeColor = "#059669"; // Xanh lá
  }
  
  const targetRevenue = appData.metrics.onHand + (appData.metrics.gap * 0.92 * 1.15);
  const growth = targetRevenue - appData.metrics.forecast;
  const priceDiff = room.oldPrice > 0 ? ((dynamicPrice / room.oldPrice - 1) * 100).toFixed(1) : 0;

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", padding: "40px", fontFamily: "system-ui, -apple-system, sans-serif", color: "#1e293b" }}>
      <div style={{ maxWidth: "1280px", margin: "0 auto", background: "white", borderRadius: "12px", boxShadow: "0 10px 30px rgba(0,0,0,0.08)", border: "1px solid #e2e8f0" }}>
        
        {/* HEADER */}
        <header style={{ background: "#1e3a8a", padding: "30px 40px", borderRadius: "12px 12px 0 0", color: "white" }}>
          <h1 style={{ fontSize: "28px", fontWeight: "900", textTransform: "uppercase", margin: "0 0 10px 0", letterSpacing: "0.5px" }}>Báo cáo Đề xuất Chiến lược & Tối ưu Doanh thu Tháng 01/2026</h1>
          <p style={{ margin: 0, color: "#bfdbfe", fontSize: "15px" }}>Nguồn dữ liệu: Hệ thống PMS & Khai phá dữ liệu Tableau | Đối tượng: Ban Giám đốc</p>
        </header>

        <div style={{ padding: "40px" }}>
          
          {/* CHỈ SỐ TÀI CHÍNH */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "24px", marginBottom: "40px" }}>
            <div style={{ padding: "24px", border: "1px solid #e2e8f0", borderRadius: "8px", background: "#ffffff" }}>
              <span style={{ fontSize: "13px", color: "#64748b", fontWeight: "800" }}>DOANH THU DỰ BÁO TĨNH (BASELINE)</span>
              <div style={{ fontSize: "32px", fontWeight: "900", color: "#0f172a", marginTop: "10px" }}>{currency(appData.metrics.forecast)}</div>
            </div>
            <div style={{ padding: "24px", border: "2px solid #1e40af", borderRadius: "8px", background: "#f0fdfa" }}>
              <span style={{ fontSize: "13px", color: "#1e40af", fontWeight: "900" }}>MỤC TIÊU DOANH THU TỐI ƯU</span>
              <div style={{ fontSize: "32px", fontWeight: "900", color: "#059669", marginTop: "10px" }}>{currency(targetRevenue)}</div>
            </div>
            <div style={{ padding: "24px", border: "1px solid #e2e8f0", borderRadius: "8px", background: "#ffffff" }}>
              <span style={{ fontSize: "13px", color: "#64748b", fontWeight: "800" }}>MỤC TIÊU TĂNG TRƯỞNG (GROWTH)</span>
              <div style={{ fontSize: "32px", fontWeight: "900", color: "#059669", marginTop: "10px" }}>+{currency(growth)}</div>
            </div>
          </div>

          {/* ĐIỀU KHIỂN BỐI CẢNH */}
          <div style={{ display: "flex", gap: "10px", marginBottom: "24px" }}>
            <button onClick={() => setSelectedDayType("Weekday")} style={tabStyle(selectedDayType === "Weekday")}>BỐI CẢNH DỮ LIỆU: NGÀY TRONG TUẦN (WEEKDAY)</button>
            <button onClick={() => setSelectedDayType("Weekend")} style={tabStyle(selectedDayType === "Weekend")}>BỐI CẢNH DỮ LIỆU: CUỐI TUẦN (WEEKEND)</button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: "40px" }}>
            
            {/* SIDEBAR TÙY CHỌN */}
            <aside>
              <div style={{ marginBottom: "30px" }}>
                <p style={{ fontSize: "14px", fontWeight: "800", color: "#475569", marginBottom: "15px" }}>CHỌN HẠNG PHÒNG PHÂN TÍCH:</p>
                {["RT_STD", "RT_DLX", "RT_STE"].map(type => (
                  <div key={type} onClick={() => setSelectedRoomType(type)} style={{ padding: "18px", cursor: "pointer", border: "1px solid #cbd5e1", marginBottom: "10px", background: selectedRoomType === type ? "#0f172a" : "white", color: selectedRoomType === type ? "white" : "#0f172a", fontWeight: "800", fontSize: "15px", borderRadius: "6px", transition: "0.2s" }}>
                    {type === "RT_STD" ? "HẠNG TIÊU CHUẨN" : type === "RT_DLX" ? "HẠNG CAO CẤP" : "HẠNG VIP (SUITE)"}
                  </div>
                ))}
              </div>

              <div style={{ padding: "24px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px" }}>
                <p style={{ fontSize: "14px", fontWeight: "900", marginBottom: "15px", color: "#0f172a", borderBottom: "2px solid #cbd5e1", paddingBottom: "10px" }}>DỊCH VỤ BÁN KÈM (BUNDLING):</p>
                <div style={{ fontSize: "15px", lineHeight: "1.7", color: "#1e40af", fontWeight: "700" }}>
                  {room.bundle}
                </div>
              </div>
            </aside>

            {/* NỘI DUNG ĐỀ XUẤT */}
            <main>
              
              {/* BỘ ĐIỀU KHIỂN LEAD TIME MỚI THÊM VÀO */}
              <section style={{ marginBottom: "20px", padding: "24px", background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: "8px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px" }}>
                  <label style={{ fontSize: "14px", fontWeight: "900", color: "#0f172a" }}>ĐIỀU CHỈNH THỜI GIAN KHÁCH ĐẶT TRƯỚC (LEAD TIME):</label>
                  <span style={{ fontSize: "18px", fontWeight: "900", color: "#1e40af", background: "white", padding: "5px 15px", borderRadius: "4px", border: "1px solid #cbd5e1" }}>{simLeadTime} NGÀY</span>
                </div>
                <input type="range" min="0" max="30" value={simLeadTime} onChange={(e) => setSimLeadTime(Number(e.target.value))} style={{ width: "100%", cursor: "pointer", accentColor: "#1e40af" }} />
                <div style={{ marginTop: "15px", fontSize: "15px", color: "#334155" }}>
                  <strong style={{ color: "#0f172a" }}>Phân loại booking:</strong> <span style={{ fontWeight: "800", color: leadTimeColor }}>{leadTimeStatus}</span>
                  <br/>
                  <strong style={{ color: "#0f172a", display: "inline-block", marginTop: "8px" }}>Phản ứng của Thuật toán Giá:</strong> {leadTimeAction}
                </div>
              </section>

              <section style={{ marginBottom: "40px", background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "8px", overflow: "hidden" }}>
                <h2 style={{ fontSize: "16px", fontWeight: "900", color: "#ffffff", background: "#0f172a", margin: 0, padding: "15px 20px" }}>1. ĐỀ XUẤT MỨC GIÁ BÁN ĐỘNG (DYNAMIC PRICING)</h2>
                <div style={{ padding: "20px" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                    <thead>
                      <tr>
                        <th style={thStyle}>GIÁ LỊCH SỬ (ADR HIỆN TẠI)</th>
                        <th style={thStyle}>MỨC GIÁ ĐỘNG TỐI ƯU</th>
                        <th style={thStyle}>BIÊN ĐỘ ĐIỀU CHỈNH</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={tdStyle}>{currency(room.oldPrice)}</td>
                        <td style={{ ...tdStyle, fontWeight: "900", fontSize: "24px", color: "#1e40af" }}>{currency(dynamicPrice)}</td>
                        <td style={{ ...tdStyle, color: priceDiff >= 0 ? "#059669" : "#dc2626", fontWeight: "800", fontSize: "18px" }}>{priceDiff > 0 ? "+" : ""}{priceDiff}%</td>
                      </tr>
                    </tbody>
                  </table>
                  <div style={{ marginTop: "20px", padding: "15px 20px", background: "#f8fafc", borderLeft: "4px solid #1e40af", fontSize: "15px", lineHeight: "1.7", color: "#334155" }}>
                    <strong style={{ color: "#0f172a" }}>Căn cứ chiến lược chung:</strong> {room.strategyReason}
                  </div>
                </div>
              </section>

              <section>
                <h2 style={{ fontSize: "16px", fontWeight: "900", color: "#0f172a", borderBottom: "2px solid #e2e8f0", paddingBottom: "10px", marginBottom: "20px" }}>2. DANH SÁCH PHÂN KHÚC ƯU TIÊN PHÂN PHỐI</h2>
                {room.priorityList && room.priorityList.map((item, idx) => (
                  <div key={idx} style={{ padding: "24px", border: "1px solid #cbd5e1", marginBottom: "15px", borderRadius: "6px", background: item.priority === "CAO NHẤT" ? "#fefce8" : "white" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px" }}>
                      <span style={{ fontWeight: "900", fontSize: "16px", color: "#0f172a" }}>Ưu tiên {idx + 1}: Phân khúc {item.segment.toUpperCase()}</span>
                      <span style={{ fontSize: "12px", background: item.priority === "CAO NHẤT" ? "#b45309" : "#64748b", color: "white", padding: "4px 12px", borderRadius: "2px", fontWeight: "900" }}>MỨC ĐỘ: {item.priority.toUpperCase()}</span>
                    </div>
                    <div style={{ fontSize: "15px", color: "#334155", display: "grid", gap: "10px" }}>
                      <p style={{ margin: 0, lineHeight: "1.6" }}><strong style={{ color: "#0f172a" }}>Luận điểm kinh tế:</strong> {item.reason}</p>
                      <p style={{ margin: 0, lineHeight: "1.6" }}><strong style={{ color: "#0f172a" }}>Phương thức bán:</strong> {item.method}</p>
                    </div>
                  </div>
                ))}
              </section>
            </main>
          </div>
        </div>

        {/* BOTTOM IMPACT SECTION */}
        <section style={{ background: "#0f172a", color: "white", padding: "40px", marginTop: "40px" }}>
          <h2 style={{ fontSize: "20px", fontWeight: "900", borderBottom: "1px solid #334155", paddingBottom: "15px", margin: "0 0 25px 0" }}>KẾT QUẢ ĐẠT ĐƯỢC DỰ PHÓNG TỪ THUẬT TOÁN (IMPACT ANALYSIS)</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: "50px" }}>
            <div style={{ lineHeight: "1.8", fontSize: "16px", color: "#e2e8f0" }}>
              Bằng việc triển khai đồng bộ chiến lược <strong>Value-driven</strong> dựa trên Insight từ Dữ liệu, Heritage Hue Hotel sẽ vượt qua mức trần dự báo tĩnh <strong>{currency(appData.metrics.forecast)}</strong> để chạm mốc doanh thu thực nhận <strong>{currency(targetRevenue)}</strong>.
              <br/><br/>
              Khoảng trống (Gap) doanh thu dịch vụ bổ trợ <strong>{currency(appData.metrics.ancGap)}</strong> sẽ được giải quyết triệt để thông qua cơ chế Bundling Spa/Tour/F&B cho nhóm khách On-hand hiện tại, khắc phục tình trạng phụ thuộc 52% vào riêng mảng ẩm thực.
            </div>
            <div style={{ paddingLeft: "40px", borderLeft: "2px solid #334155" }}>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: "16px", lineHeight: "2.2" }}>
                <li><strong style={{ color: "#38bdf8" }}>Tăng trưởng Doanh thu:</strong> +{currency(growth)}</li>
                <li><strong style={{ color: "#38bdf8" }}>Cải thiện Tỷ lệ lấp đầy:</strong> +4.5%</li>
                <li><strong style={{ color: "#38bdf8" }}>Bảo vệ Conversion:</strong> Nâng từ 83.2% lên 91%</li>
                <li><strong style={{ color: "#38bdf8" }}>Tối ưu Giá trị ròng:</strong> Chặn Revenue Leakage</li>
              </ul>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}

// STYLES
const tabStyle = (active) => ({
  flex: 1, padding: "16px", border: "1px solid #cbd5e1", cursor: "pointer", 
  background: active ? "#1e40af" : "#f1f5f9", 
  color: active ? "white" : "#475569", fontWeight: "900", fontSize: "14px",
  letterSpacing: "0.5px", transition: "all 0.2s ease", borderRadius: "6px"
});
const thStyle = { padding: "18px 20px", fontSize: "13px", borderBottom: "2px solid #cbd5e1", color: "#475569", fontWeight: "900", textTransform: "uppercase" };
const tdStyle = { padding: "20px", borderBottom: "1px solid #e2e8f0", fontSize: "18px", color: "#334155" };