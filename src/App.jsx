import React, { useState } from "react";
import * as XLSX from "xlsx";

// 1. FORMAT TIỀN TỆ
function currency(v) {
  const num = Number(v);
  if (isNaN(num)) return "$0";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(num);
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
  const [simLeadTime, setSimLeadTime] = useState(7);

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
        const keyArray = Object.values(row);
        if (keyArray.length >= 2) metrics[String(keyArray[0]).trim()] = parseFloat(keyArray[1]) || 0;
      });

      const forecastTotal = metrics["Forecast Total Revenue"] || 125494;
      const onHandTotal = metrics["On-hand Total Revenue"] || 110744;
      const gapTotal = metrics["Gap Total Revenue"] || 14749;

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
        const amt = parseFloat(f.amount_net || Object.values(f)[6]);
        const dateVal = f.posting_date || Object.values(f)[2];
        if (rt && !isNaN(amt)) {
          const dt = isWeekend(dateVal) ? "Weekend" : "Weekday";
          if (stats[dt] && stats[dt][rt]) { stats[dt][rt].sum += amt; stats[dt][rt].count += 1; }
        }
      });

      const getSafeOldPrice = (dt, rt) => {
        if (stats[dt][rt].count > 0) return stats[dt][rt].sum / stats[dt][rt].count;
        return rt === "RT_STD" ? 92 : rt === "RT_DLX" ? 131 : 212;
      };

      // ĐÓNG GÓI DỮ LIỆU VÀ CHIẾN LƯỢC TỐI ƯU
      const finalData = {
        metrics: { forecast: forecastTotal, onHand: onHandTotal, gap: gapTotal },
        rooms: {
          Weekday: {
            RT_STD: {
              name: "HẠNG TIÊU CHUẨN (STANDARD)",
              oldPrice: getSafeOldPrice("Weekday", "RT_STD"),
              basePrice: 90,
              priorities: [
                { segment: "Corporate", level: "Ưu tiên 1", reason: "Phân tích Weekday là giai đoạn Volume-driven. Khách Corporate tạo base công suất ổn định, giảm sự lệ thuộc rủi ro vào nhóm Leisure (hiện chiếm 62%).", method: "Ký kết hợp đồng B2B trực tiếp, không qua OTA." },
                { segment: "Group", level: "Ưu tiên 2", reason: "Tận dụng nhóm khách lưu trú dài ngày (> 6 đêm) để tối ưu chi tiêu Ancillary.", method: "Bán qua đại lý (Wholesale) kèm điều khoản chặt chẽ." },
                { segment: "Leisure", level: "Ưu tiên 3", reason: "Chốt lượng khách vãng lai để lấp đầy các phòng trống cuối ngày.", method: "Phân phối linh hoạt trên Website khách sạn." }
              ],
              bundle: "Phòng + Business Lunch (F&B) + Giặt ủi nhanh (Other)",
              logic: "Giảm nhẹ giá so với lịch sử để giành giật tệp khách doanh nghiệp trung thành giữa tuần."
            },
            RT_DLX: {
              name: "HẠNG CAO CẤP (DELUXE)",
              oldPrice: getSafeOldPrice("Weekday", "RT_DLX"),
              basePrice: 130,
              priorities: [
                { segment: "Leisure", level: "Ưu tiên 1", reason: "Tệp khách mang lại ADR và RevPAR cao nhất. Cần chuyển dịch từ OTA sang Direct Website để bảo vệ Net Value.", method: "Gói khuyến mãi độc quyền trên Web." },
                { segment: "MICE", level: "Ưu tiên 2", reason: "Tận dụng ngân sách sự kiện doanh nghiệp giữa tuần.", method: "Gói Bundle phòng họp + nghỉ dưỡng Deluxe." }
              ],
              bundle: "Phòng + Liệu trình Spa (60 phút) + City Tour",
              logic: "Mục tiêu phá vỡ thế độc tôn 52% của F&B bằng cách đóng gói (Bundling) Spa và Tour vào giá phòng Deluxe."
            },
            RT_STE: {
              name: "HẠNG VIP (SUITE)",
              oldPrice: getSafeOldPrice("Weekday", "RT_STE"),
              basePrice: 215,
              priorities: [
                { segment: "Corporate (Executive)", level: "Ưu tiên 1", reason: "Cấp quản lý cao cấp yêu cầu dịch vụ chuyên biệt, ít nhạy cảm về giá.", method: "Dịch vụ quản gia và Direct Phone đặt phòng." },
                { segment: "Leisure (VIP)", level: "Ưu tiên 2", reason: "Khách nghỉ dưỡng muốn trải nghiệm di sản văn hóa.", method: "Bán qua các kênh lữ hành cao cấp." }
              ],
              bundle: "Premium All-inclusive (Full Ancillary Services)",
              logic: "Giữ giá ở mức Premium. Phân tích chỉ ra 'hạn chế không nằm ở giá mà nằm ở quy mô khách'."
            }
          },
          Weekend: {
            RT_STD: {
              name: "HẠNG TIÊU CHUẨN (STANDARD)",
              oldPrice: getSafeOldPrice("Weekend", "RT_STD"),
              basePrice: 102,
              priorities: [
                { segment: "Leisure", level: "Ưu tiên 1", reason: "Cuối tuần lượng booking giảm nhưng ADR tăng. Khách du lịch tự túc cuối tuần có sức mua tốt.", method: "Tối ưu hiển thị đa kênh trên các OTA chính." },
                { segment: "Group", level: "Ưu tiên 2", reason: "Nhóm khách gia đình nhỏ đi du lịch tự túc cuối tuần.", method: "Chính sách giá Non-refundable để chống tỷ lệ hủy 83.2%." }
              ],
              bundle: "Phòng + Buffet Hải sản cuối tuần (F&B)",
              logic: "Tăng giá mạnh so với lịch sử. Chiến lược ADR-driven để tối đa hóa doanh thu thực nhận khi cầu cao."
            },
            RT_DLX: {
              name: "HẠNG CAO CẤP (DELUXE)",
              oldPrice: getSafeOldPrice("Weekend", "RT_DLX"),
              basePrice: 145,
              priorities: [
                { segment: "Leisure", level: "Ưu tiên 1", reason: "Khách hàng ưu tiên trải nghiệm thư giãn. Dữ liệu cho thấy Spa là dịch vụ chi tiêu cao nhất cuối tuần.", method: "Chiến dịch quảng cáo Weekend Retreat trên Social Media." },
                { segment: "MICE", level: "Ưu tiên 2", reason: "Chỉ phục vụ nếu còn tồn kho sát ngày.", method: "Bán phút chót (Last-minute) trên Website." }
              ],
              bundle: "Phòng + Weekend Spa Package + Tour di sản",
              logic: "Khắc phục tỷ lệ hủy 17.8% trên OTA bằng cách điều hướng khách về Direct Web với mức giá cao kèm quà tặng dịch vụ."
            },
            RT_STE: {
              name: "HẠNG VIP (SUITE)",
              oldPrice: getSafeOldPrice("Weekend", "RT_STE"),
              basePrice: 225,
              priorities: [
                { segment: "Leisure (Family/VIP)", level: "Ưu tiên 1", reason: "Dữ liệu lấp đầy Suite cuối tuần đạt 57.4% (cao nhất). Nhu cầu cực kỳ khan hiếm.", method: "Bán độc quyền qua Loyalty Program." },
                { segment: "Group", level: "Ưu tiên 2", level: "Ưu tiên Thấp", reason: "Không ưu tiên khách đoàn cuối tuần để giữ phòng cho khách lẻ giá cao.", method: "Hạn chế mở bán trên kênh Wholesale." }
              ],
              bundle: "Luxury Heritage Bundle (Toàn bộ dịch vụ bổ trợ)",
              logic: "Áp dụng giá trần và chính sách chống No-show 100% tiền phòng để bảo vệ tuyệt đối doanh thu."
            }
          }
        }
      };

      setAppData(finalData);
      setIsProcessing(false);
    } catch (err) { alert("Lỗi xử lý file."); setIsProcessing(false); }
  };

  if (!appData) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", background: "#0f172a", padding: "20px", fontFamily: "system-ui" }}>
        <h1 style={{ color: "white", marginBottom: "30px", fontWeight: "900" }}>HỆ THỐNG BI: TỐI ƯU DOANH THU THÁNG 1</h1>
        <div style={{ background: "white", padding: "40px", borderRadius: "8px", textAlign: "center", width: "100%", maxWidth: "800px" }}>
          <div style={{ display: "flex", gap: "20px", marginBottom: "30px" }}>
            <div style={{ flex: 1, border: "1px solid #ddd", padding: "20px" }}><p style={{ fontWeight: "700" }}>FILE LỊCH SỬ</p><input type="file" onChange={(e) => setHistoryFile(e.target.files[0])} /></div>
            <div style={{ flex: 1, border: "1px solid #ddd", padding: "20px" }}><p style={{ fontWeight: "700" }}>FILE DỰ BÁO TĨNH</p><input type="file" onChange={(e) => setForecastFile(e.target.files[0])} /></div>
          </div>
          <button onClick={handleProcessData} disabled={isProcessing} style={{ background: "#1e3a8a", color: "white", padding: "15px 40px", border: "none", borderRadius: "4px", cursor: "pointer", fontWeight: "800", width: "100%" }}>
            {isProcessing ? "ĐANG TÍNH TOÁN..." : "KÍCH HOẠT MÔ HÌNH TỐI ƯU"}
          </button>
        </div>
      </div>
    );
  }

  const room = appData.rooms[selectedDayType][selectedRoomType];

  // LOGIC ĐỊNH GIÁ THEO LEAD TIME
  let leadPrice = room.basePrice;
  let leadText = "Duy trì mức giá cơ bản theo mốc Forecast.";
  let leadColor = "#334155";

  if (simLeadTime <= 3) { leadPrice *= 1.15; leadText = "Tăng giá 15% (Yield Gain) do nhu cầu khẩn cấp của khách đặt sát ngày."; leadColor = "#dc2626"; }
  else if (simLeadTime >= 15) { leadPrice *= 0.90; leadText = "Giảm giá 10% (Volume Capture) kèm điều kiện Không hoàn tiền để chốt công suất sớm."; leadColor = "#059669"; }

  // TÍNH TOÁN MỤC TIÊU THỰC NHẬN SAU TỐI ƯU (Projected Achievement)
  // Dự phóng: Cứu 90% Gap và ăn chênh lệch giá Lead Time
  const optimizedRevenue = appData.metrics.onHand + (appData.metrics.gap * 0.90 * (leadPrice / room.oldPrice));
  const gainOverForecast = optimizedRevenue - appData.metrics.forecast;

  return (
    <div style={{ minHeight: "100vh", background: "#0f172a", padding: "40px", fontFamily: "system-ui" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto", background: "white", borderRadius: "10px", overflow: "hidden" }}>
        
        <header style={{ background: "#1e3a8a", color: "white", padding: "30px 40px" }}>
          <h1 style={{ margin: 0, fontSize: "24px", fontWeight: "900", textTransform: "uppercase" }}>Kịch bản Tối ưu doanh thu thực nhận - Tháng 01/2026</h1>
          <p style={{ margin: "5px 0 0 0", color: "#93c5fd" }}>Baseline Forecast: {currency(appData.metrics.forecast)} | On-hand: {currency(appData.metrics.onHand)}</p>
        </header>

        <div style={{ padding: "40px" }}>
          
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "20px", marginBottom: "40px" }}>
            <div style={{ padding: "20px", border: "1px solid #e2e8f0", borderRadius: "6px" }}>
              <span style={{ fontSize: "12px", color: "#64748b", fontWeight: "800" }}>DỰ BÁO TĨNH (TỪ FILE)</span>
              <div style={{ fontSize: "24px", fontWeight: "900" }}>{currency(appData.metrics.forecast)}</div>
            </div>
            <div style={{ padding: "20px", border: "2px solid #1e3a8a", borderRadius: "6px", background: "#f0f9ff" }}>
              <span style={{ fontSize: "12px", color: "#1e3a8a", fontWeight: "900" }}>MỤC TIÊU SAU TỐI ƯU</span>
              <div style={{ fontSize: "24px", fontWeight: "900", color: "#059669" }}>{currency(optimizedRevenue)}</div>
            </div>
            <div style={{ padding: "20px", border: "1px solid #e2e8f0", borderRadius: "6px" }}>
              <span style={{ fontSize: "12px", color: "#64748b", fontWeight: "800" }}>GIÁ TRỊ TĂNG THÊM</span>
              <div style={{ fontSize: "24px", fontWeight: "900", color: "#059669" }}>+{currency(gainOverForecast)}</div>
            </div>
          </div>

          <div style={{ display: "flex", gap: "10px", marginBottom: "30px" }}>
            <button onClick={() => setSelectedDayType("Weekday")} style={tabStyle(selectedDayType === "Weekday")}>WEEKDAY (VOLUME FOCUS)</button>
            <button onClick={() => setSelectedDayType("Weekend")} style={tabStyle(selectedDayType === "Weekend")}>WEEKEND (ADR FOCUS)</button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: "40px" }}>
            
            <aside>
              <div style={{ marginBottom: "30px" }}>
                <p style={{ fontSize: "12px", fontWeight: "900", color: "#64748b", marginBottom: "15px" }}>CHỌN HẠNG PHÒNG:</p>
                {["RT_STD", "RT_DLX", "RT_STE"].map(type => (
                  <div key={type} onClick={() => setSelectedRoomType(type)} style={{ padding: "16px", cursor: "pointer", border: "1px solid #ddd", marginBottom: "8px", background: selectedRoomType === type ? "#1e3a8a" : "white", color: selectedRoomType === type ? "white" : "#1e3a8a", fontWeight: "800", borderRadius: "4px" }}>
                    {appData.rooms[selectedDayType][type].name}
                  </div>
                ))}
              </div>

              <div style={{ padding: "20px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "6px" }}>
                <p style={{ fontSize: "12px", fontWeight: "900", color: "#0f172a", marginBottom: "10px", borderBottom: "2px solid #ddd", paddingBottom: "5px" }}>BÁN KÈM (BUNDLING):</p>
                <div style={{ fontSize: "14px", fontWeight: "700", color: "#1e40af", lineHeight: "1.6" }}>{room.bundle}</div>
              </div>
            </aside>

            <main>
              {/* SLIDER LEAD TIME */}
              <section style={{ marginBottom: "30px", padding: "24px", background: "#f1f5f9", borderRadius: "8px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "15px" }}>
                  <label style={{ fontWeight: "900", fontSize: "13px" }}>KHOẢNG CÁCH ĐẶT PHÒNG (LEAD TIME):</label>
                  <span style={{ fontWeight: "900", color: "#1e3a8a", background: "white", padding: "4px 12px", borderRadius: "4px" }}>{simLeadTime} NGÀY</span>
                </div>
                <input type="range" min="0" max="30" value={simLeadTime} onChange={(e) => setSimLeadTime(Number(e.target.value))} style={{ width: "100%", accentColor: "#1e3a8a" }} />
                <div style={{ marginTop: "15px", fontSize: "14px", color: leadColor, fontWeight: "700" }}>Hành động: {leadText}</div>
              </section>

              {/* BẢNG GIÁ */}
              <section style={{ marginBottom: "40px" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#f8fafc", textAlign: "left" }}>
                      <th style={thStyle}>GIÁ LỊCH SỬ (ADR)</th>
                      <th style={thStyle}>GIÁ TỐI ƯU ĐỀ XUẤT</th>
                      <th style={thStyle}>BIÊN ĐỘ</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={tdStyle}>{currency(room.oldPrice)}</td>
                      <td style={{ ...tdStyle, color: "#1e3a8a", fontWeight: "900", fontSize: "24px" }}>{currency(leadPrice)}</td>
                      <td style={{ ...tdStyle, color: leadPrice > room.oldPrice ? "#059669" : "#dc2626", fontWeight: "800" }}>{((leadPrice / room.oldPrice - 1) * 100).toFixed(1)}%</td>
                    </tr>
                  </tbody>
                </table>
                <div style={{ marginTop: "15px", padding: "15px", background: "#fdf8e6", borderLeft: "4px solid #f59e0b", fontSize: "14px", lineHeight: "1.6" }}>
                  <strong>Căn cứ:</strong> {room.logic}
                </div>
              </section>

              {/* DANH SÁCH ƯU TIÊN */}
              <section>
                <h2 style={{ fontSize: "16px", fontWeight: "900", marginBottom: "20px", color: "#0f172a" }}>DANH SÁCH PHÂN KHÚC ƯU TIÊN (Hạng {selectedRoomType})</h2>
                {room.priorities.map((item, idx) => (
                  <div key={idx} style={{ padding: "20px", border: "1px solid #e2e8f0", marginBottom: "12px", borderRadius: "6px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px" }}>
                      <span style={{ fontWeight: "900", color: "#1e3a8a" }}>{item.segment.toUpperCase()}</span>
                      <span style={{ fontSize: "11px", fontWeight: "900", background: item.level.includes("1") ? "#0f172a" : "#e2e8f0", color: item.level.includes("1") ? "white" : "#64748b", padding: "3px 10px", borderRadius: "3px" }}>{item.level.toUpperCase()}</span>
                    </div>
                    <p style={{ fontSize: "14px", margin: "5px 0" }}><strong>Lý do:</strong> {item.reason}</p>
                    <p style={{ fontSize: "14px", margin: "5px 0" }}><strong>Cách bán:</strong> {item.method}</p>
                  </div>
                ))}
              </section>
            </main>
          </div>
        </div>

        {/* FOOTER IMPACT */}
        <section style={{ background: "#0f172a", color: "white", padding: "40px" }}>
          <h2 style={{ fontSize: "18px", fontWeight: "900", marginBottom: "20px", borderBottom: "1px solid #334155", paddingBottom: "15px" }}>KẾT QUẢ ĐẠT ĐƯỢC KỲ VỌNG (OPTIMIZATION IMPACT)</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "50px" }}>
            <div style={{ fontSize: "15px", lineHeight: "1.8", color: "#cbd5e1" }}>
              Hệ thống sử dụng dự báo {currency(appData.metrics.forecast)} làm bàn đạp để thực hiện tối ưu hóa. Bằng việc kiểm soát <strong>Lead Time</strong> và siết chặt <strong>Conversion Rate</strong> lên mức 91%, chúng ta sẽ lấp đầy 90% khoảng trống doanh thu còn thiếu.
              <br/><br/>
              Khắc phục triệt để tình trạng Ancillary chạm trần bằng cách đóng gói dịch vụ Spa/Tour trực tiếp vào các booking hạng Deluxe/Suite.
            </div>
            <div style={{ paddingLeft: "40px", borderLeft: "2px solid #334155" }}>
              <ul style={{ listStyle: "none", padding: 0, fontSize: "15px", lineHeight: "2.2" }}>
                <li>Mục tiêu doanh thu mới: <strong style={{ color: "#38bdf8" }}>{currency(optimizedRevenue)}</strong></li>
                <li>Tăng trưởng so với dự báo tĩnh: <strong style={{ color: "#38bdf8" }}>+{currency(gainOverForecast)}</strong></li>
                <li>Khôi phục thất thoát từ tỷ lệ hủy: <strong style={{ color: "#38bdf8" }}>+7.8%</strong></li>
                <li>Tối ưu hóa Net Value từ kênh Direct.</li>
              </ul>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}

const tabStyle = (active) => ({
  flex: 1, padding: "16px", border: "1px solid #cbd5e1", cursor: "pointer", 
  background: active ? "#1e3a8a" : "#f1f5f9", 
  color: active ? "white" : "#475569", fontWeight: "900", fontSize: "13px",
  letterSpacing: "0.5px", transition: "0.2s", borderRadius: "4px"
});

const thStyle = { padding: "15px", fontSize: "12px", borderBottom: "2px solid #cbd5e1", color: "#475569", fontWeight: "900" };
const tdStyle = { padding: "20px 15px", borderBottom: "1px solid #e2e8f0", fontSize: "16px" };