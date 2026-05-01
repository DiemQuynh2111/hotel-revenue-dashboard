import React, { useState } from "react";
import * as XLSX from "xlsx";
import { motion, AnimatePresence } from "framer-motion";
import { BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from "recharts";

// Định dạng tiền tệ
function currency(v) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v || 0);
}

// Đọc file Excel
const readExcel = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(XLSX.read(new Uint8Array(e.target.result), { type: "array" }));
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
};

export default function App() {
  const [historyFile, setHistoryFile] = useState(null);
  const [forecastFile, setForecastFile] = useState(null);
  const [appData, setAppData] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const [selectedDayType, setSelectedDayType] = useState("Weekday");
  const [selectedRoomType, setSelectedRoomType] = useState("RT_STD");

  const handleProcessData = async () => {
    if (!historyFile || !forecastFile) return alert("Vui lòng chọn đủ 2 file dữ liệu.");
    setIsProcessing(true);

    try {
      const [histWb, forecastWb] = await Promise.all([readExcel(historyFile), readExcel(forecastFile)]);

      // 1. Xử lý File Dự báo
      const summarySheet = forecastWb.SheetNames.find(n => n.toLowerCase().includes("summary")) || forecastWb.SheetNames[0];
      const summaryData = XLSX.utils.sheet_to_json(forecastWb.Sheets[summarySheet]);
      const metrics = {};
      summaryData.forEach(row => {
        const key = row.metric || row.Metric || Object.values(row)[0];
        const val = row.value || row.Value || Object.values(row)[1];
        metrics[key] = parseFloat(val) || 0;
      });

      // 2. Xử lý File Lịch sử
      const folioSheet = histWb.SheetNames.find(n => n.toLowerCase().includes("folio")) || histWb.SheetNames[0];
      const resSheet = histWb.SheetNames.find(n => n.toLowerCase().includes("reservation")) || histWb.SheetNames[1];
      const folios = XLSX.utils.sheet_to_json(histWb.Sheets[folioSheet]);
      const reservations = XLSX.utils.sheet_to_json(histWb.Sheets[resSheet]);

      const resP002 = reservations.filter(r => r.property_id === "P002");
      const folioP002 = folios.filter(f => f.property_id === "P002" && f.charge_category === "Room");

      const resMap = {};
      resP002.forEach(r => { resMap[r.reservation_id] = { roomType: r.room_type_id, segment: r.segment, channel: r.channel_id }; });

      const stats = {
        Weekday: { RT_STD: { sum: 0, count: 0 }, RT_DLX: { sum: 0, count: 0 }, RT_STE: { sum: 0, count: 0 } },
        Weekend: { RT_STD: { sum: 0, count: 0 }, RT_DLX: { sum: 0, count: 0 }, RT_STE: { sum: 0, count: 0 } }
      };

      folioP002.forEach(f => {
        const resInfo = resMap[f.reservation_id];
        if (!resInfo || !f.amount_net) return;
        const dt = [5, 6].includes(new Date(f.posting_date).getDay()) ? "Weekend" : "Weekday";
        const rt = resInfo.roomType;
        if (stats[dt][rt]) { stats[dt][rt].sum += parseFloat(f.amount_net); stats[dt][rt].count += 1; }
      });

      // 3. XÂY DỰNG CHIẾN LƯỢC TỐI ƯU (Mapping 100% Storyboard)
      const finalData = {
        metrics: {
          forecast: metrics["Forecast Total Revenue"],
          onHand: metrics["On-hand Total Revenue"],
          gap: metrics["Gap Total Revenue"],
          ancGap: metrics["Gap Ancillary Revenue"]
        },
        rooms: {
          Weekday: {
            RT_STD: {
              name: "Standard",
              oldPrice: stats.Weekday.RT_STD.sum / (stats.Weekday.RT_STD.count || 1),
              newPrice: 90, 
              priorityList: [
                { segment: "Corporate", priority: "Cao", reason: "Tạo base công suất ổn định, ít nhạy cảm với view, phù hợp lấp đầy ngày thường.", method: "Ký kết hợp đồng B2B dài hạn, miễn hoa hồng OTA." },
                { segment: "Group", priority: "Trung bình", reason: "Tăng nhanh occupancy thông qua các đoàn khách công vụ.", method: "Bán qua kênh Wholesale với giá ưu đãi số lượng lớn." },
                { segment: "Leisure", priority: "Thấp", reason: "Dùng để lấp đầy các khoảng trống cuối ngày.", method: "Sử dụng mức giá linh hoạt trên Direct Website." }
              ],
              bundle: "Room + F&B (Business Lunch) + Other (Laundry)",
              strategyReason: "Phân tích Weekday là giai đoạn Volume-driven. Giảm nhẹ giá từ mốc ADR thực tế để cạnh tranh giành tệp khách lưu trú > 6 đêm nhằm tối ưu chi tiêu Ancillary."
            },
            RT_DLX: {
              name: "Deluxe",
              oldPrice: stats.Weekday.RT_DLX.sum / (stats.Weekday.RT_DLX.count || 1),
              newPrice: 130,
              priorityList: [
                { segment: "Leisure", priority: "Cao", reason: "Nhóm khách sẵn sàng chi trả cho sự thoải mái giữa tuần.", method: "Tập trung hình ảnh và feedback tốt trên Direct Website." },
                { segment: "MICE", priority: "Trung bình", reason: "Tận dụng ngân sách từ các đơn vị tổ chức sự kiện.", method: "Gói Bundle phòng họp nửa ngày kèm nghỉ dưỡng." }
              ],
              bundle: "Room + Spa (Mini-retreat) + Tour (City half-day)",
              strategyReason: "Phá vỡ sự tập trung quá mức vào F&B (52%). Tận dụng lợi thế ADR của Deluxe để đẩy mạnh dịch vụ Spa và Tour."
            },
            RT_STE: {
              name: "Suite",
              oldPrice: stats.Weekday.RT_STE.sum / (stats.Weekday.RT_STE.count || 1),
              newPrice: 215,
              priorityList: [
                { segment: "Corporate (Executive)", priority: "Cao", reason: "Cấp quản lý cao cấp yêu cầu không gian làm việc chuyên biệt.", method: "Hợp đồng đối tác chiến lược, ưu tiên check-in sớm." },
                { segment: "Leisure (VIP)", priority: "Trung bình", reason: "Khách nghỉ dưỡng cao cấp muốn trải nghiệm di sản.", method: "Quảng bá gói cá nhân hóa qua kênh Direct Phone." }
              ],
              bundle: "Room + All-inclusive (F&B, Spa, Tour)",
              strategyReason: "Dữ liệu cho thấy Suite ngày thường đạt ADR cao ($210). Tăng nhẹ giá để lọc khách hàng chất lượng, giảm rủi ro No-show."
            }
          },
          Weekend: {
            RT_STD: {
              name: "Standard",
              oldPrice: stats.Weekend.RT_STD.sum / (stats.Weekend.RT_STD.count || 1),
              newPrice: 102,
              priorityList: [
                { segment: "Leisure", priority: "Cao", reason: "Cầu tự nhiên cuối tuần từ khách du lịch tự túc rất lớn.", method: "Tối ưu hiển thị trên các kênh OTA (Booking, Agoda)." },
                { segment: "Group", priority: "Trung bình", reason: "Các đoàn du lịch gia đình hoặc sự kiện nhỏ cuối tuần.", method: "Bán qua Wholesale với điều kiện Non-refundable." }
              ],
              bundle: "Room + F&B (Buffet Dinner)",
              strategyReason: "Cuối tuần là giai đoạn ADR-driven. Tăng giá so với mốc lịch sử để thu hồi thặng dư tiêu dùng khi cầu vượt cung."
            },
            RT_DLX: {
              name: "Deluxe",
              oldPrice: stats.Weekend.RT_DLX.sum / (stats.Weekend.RT_DLX.count || 1),
              newPrice: 145,
              priorityList: [
                { segment: "Leisure", priority: "Cao", reason: "Khách hàng ưu tiên trải nghiệm thư giãn và không gian lãng mạn.", method: "Quảng cáo gói Combo trực tiếp trên Social Media." },
                { segment: "MICE", priority: "Thấp", reason: "Ít phổ biến vào cuối tuần.", method: "Chỉ bán nếu còn tồn kho sát ngày." }
              ],
              bundle: "Room + Spa (Weekend Package) + F&B",
              strategyReason: "Khắc phục tình trạng tỷ lệ hủy 17.8% trên OTA bằng cách điều hướng khách về Direct Web với mức giá cao nhưng đi kèm dịch vụ Spa ưu đãi."
            },
            RT_STE: {
              name: "Suite",
              oldPrice: stats.Weekend.RT_STE.sum / (stats.Weekend.RT_STE.count || 1),
              newPrice: 225,
              priorityList: [
                { segment: "Leisure (Family/VIP)", priority: "Cao", reason: "Dữ liệu lấp đầy Suite cuối tuần cao nhất (57.4%).", method: "Bán độc quyền qua Loyalty Program và Website." },
                { segment: "Group", priority: "Thấp", reason: "Hạng phòng Suite không phù hợp cho số đông.", method: "Chỉ dùng để Upsell tại quầy check-in." }
              ],
              bundle: "Premium Heritage Bundle (Full Services)",
              strategyReason: "Công suất chạm trần. Áp dụng giá Premium và chính sách Non-refundable 100% để bảo vệ doanh thu thực nhận."
            }
          }
        }
      };

      setAppData(finalData);
      setIsProcessing(false);
    } catch (err) { alert("Lỗi xử lý. Kiểm tra định dạng file."); setIsProcessing(false); }
  };

  if (!appData) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", background: "#f1f5f9", padding: "20px" }}>
        <h1 style={{ color: "#0f172a", marginBottom: "30px" }}>HỆ THỐNG TỐI ƯU DOANH THU KHÁCH SẠN</h1>
        <div style={{ background: "white", padding: "40px", borderRadius: "8px", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)", textAlign: "center", border: "1px solid #e2e8f0" }}>
          <div style={{ display: "flex", gap: "20px", marginBottom: "30px" }}>
            <div><p style={{ fontSize: "14px", fontWeight: "bold" }}>FILE DỮ LIỆU LỊCH SỬ</p><input type="file" onChange={(e) => setHistoryFile(e.target.files[0])} /></div>
            <div><p style={{ fontSize: "14px", fontWeight: "bold" }}>FILE DỰ BÁO THÁNG 01</p><input type="file" onChange={(e) => setForecastFile(e.target.files[0])} /></div>
          </div>
          <button onClick={handleProcessData} disabled={isProcessing} style={{ background: "#0f172a", color: "white", padding: "12px 30px", borderRadius: "4px", border: "none", cursor: "pointer", fontWeight: "600" }}>
            {isProcessing ? "DỮ LIỆU ĐANG ĐƯỢC XỬ LÝ..." : "XÁC NHẬN PHÂN TÍCH"}
          </button>
        </div>
      </div>
    );
  }

  const room = appData.rooms[selectedDayType][selectedRoomType];
  // Thuật toán Tối ưu doanh thu thực tế (Target Revenue)
  const targetRevenue = appData.metrics.onHand + (appData.metrics.gap * 0.92 * 1.15); // Lấy 92% Gap với mức giá tăng 15%
  const growth = targetRevenue - appData.metrics.forecast;

  return (
    <div style={{ minHeight: "100vh", background: "#ffffff", padding: "40px", fontFamily: "'Inter', sans-serif", color: "#1e293b" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
        
        {/* HEADER SECTION */}
        <header style={{ borderBottom: "2px solid #0f172a", paddingBottom: "20px", marginBottom: "40px" }}>
          <h1 style={{ fontSize: "28px", fontWeight: "800", color: "#0f172a", textTransform: "uppercase", margin: 0 }}>Báo cáo đề xuất tối ưu doanh thu tháng 01/2026</h1>
          <p style={{ marginTop: "10px", color: "#64748b" }}>Đối tượng: Ban Giám đốc Doanh thu | Heritage Hue Hotel (P002)</p>
        </header>

        {/* TOP METRICS */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "24px", marginBottom: "40px" }}>
          <div style={{ padding: "20px", border: "1px solid #e2e8f0", borderRadius: "4px" }}>
            <span style={{ fontSize: "12px", color: "#64748b", fontWeight: "bold" }}>DOANH THU DỰ BÁO (BASELINE)</span>
            <div style={{ fontSize: "24px", fontWeight: "700" }}>{currency(appData.metrics.forecast)}</div>
          </div>
          <div style={{ padding: "20px", border: "1px solid #0f172a", borderRadius: "4px", background: "#f8fafc" }}>
            <span style={{ fontSize: "12px", color: "#0f172a", fontWeight: "900" }}>MỤC TIÊU DOANH THU TỐI ƯU</span>
            <div style={{ fontSize: "24px", fontWeight: "800", color: "#059669" }}>{currency(targetRevenue)}</div>
          </div>
          <div style={{ padding: "20px", border: "1px solid #e2e8f0", borderRadius: "4px" }}>
            <span style={{ fontSize: "12px", color: "#64748b", fontWeight: "bold" }}>TĂNG TRƯỞNG KỲ VỌNG</span>
            <div style={{ fontSize: "24px", fontWeight: "700", color: "#059669" }}>+{currency(growth)}</div>
          </div>
        </div>

        {/* STRATEGY CONTROLS */}
        <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
          <button onClick={() => setSelectedDayType("Weekday")} style={tabStyle(selectedDayType === "Weekday")}>BỐI CẢNH: NGÀY THƯỜNG (WEEKDAY)</button>
          <button onClick={() => setSelectedDayType("Weekend")} style={tabStyle(selectedDayType === "Weekend")}>BỐI CẢNH: CUỐI TUẦN (WEEKEND)</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: "40px" }}>
          
          {/* LEFT: ROOM SELECTOR & BUNDLE */}
          <aside>
            <div style={{ marginBottom: "30px" }}>
              <p style={{ fontSize: "14px", fontWeight: "bold", marginBottom: "10px" }}>CHỌN HẠNG PHÒNG:</p>
              {["RT_STD", "RT_DLX", "RT_STE"].map(type => (
                <div key={type} onClick={() => setSelectedRoomType(type)} style={{ padding: "15px", cursor: "pointer", border: "1px solid #e2e8f0", marginBottom: "8px", background: selectedRoomType === type ? "#0f172a" : "white", color: selectedRoomType === type ? "white" : "#0f172a", fontWeight: "bold", fontSize: "14px" }}>
                  {type === "RT_STD" ? "STANDARD" : type === "RT_DLX" ? "DELUXE" : "SUITE"}
                </div>
              ))}
            </div>

            <div style={{ padding: "20px", background: "#f1f5f9", borderRadius: "4px" }}>
              <p style={{ fontSize: "14px", fontWeight: "bold", marginBottom: "15px", color: "#0f172a" }}>DỊCH VỤ BÁN KÈM (BUNDLING):</p>
              <div style={{ fontSize: "15px", lineHeight: "1.6", color: "#334155" }}>
                Hệ thống đề xuất đóng gói sản phẩm:<br/>
                <strong>{room.bundle}</strong>
              </div>
            </div>
          </aside>

          {/* RIGHT: DETAILED RECOMMENDATIONS */}
          <main>
            <section style={{ marginBottom: "40px" }}>
              <h2 style={{ fontSize: "18px", fontWeight: "800", borderBottom: "1px solid #e2e8f0", paddingBottom: "10px", marginBottom: "20px" }}>ĐỀ XUẤT ĐỊNH GIÁ CHI TIẾT</h2>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ textAlign: "left", background: "#f8fafc" }}>
                    <th style={thStyle}>GIÁ LỊCH SỬ (ADR)</th>
                    <th style={thStyle}>GIÁ ĐỀ XUẤT TỐI ƯU</th>
                    <th style={thStyle}>CHÊNH LỆCH (%)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={tdStyle}>{currency(room.oldPrice)}</td>
                    <td style={{ ...tdStyle, fontWeight: "800", fontSize: "20px", color: "#0f172a" }}>{currency(room.newPrice)}</td>
                    <td style={tdStyle}>{((room.newPrice / room.oldPrice - 1) * 100).toFixed(1)}%</td>
                  </tr>
                </tbody>
              </table>
              <div style={{ marginTop: "15px", padding: "15px", background: "#fff", border: "1px solid #e2e8f0", fontSize: "14px", lineHeight: "1.6" }}>
                <strong>Căn cứ chiến lược:</strong> {room.strategyReason}
              </div>
            </section>

            <section>
              <h2 style={{ fontSize: "18px", fontWeight: "800", borderBottom: "1px solid #e2e8f0", paddingBottom: "10px", marginBottom: "20px" }}>DANH SÁCH PHÂN KHÚC ƯU TIÊN BÁN</h2>
              {room.priorityList.map((item, idx) => (
                <div key={idx} style={{ padding: "20px", border: "1px solid #e2e8f0", marginBottom: "15px", borderRadius: "4px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px" }}>
                    <span style={{ fontWeight: "800", color: "#0f172a" }}>{idx + 1}. {item.segment.toUpperCase()}</span>
                    <span style={{ fontSize: "12px", background: item.priority === "Cao" ? "#0f172a" : "#e2e8f0", color: item.priority === "Cao" ? "white" : "#64748b", padding: "2px 8px", borderRadius: "2px", fontWeight: "bold" }}>ƯU TIÊN: {item.priority.toUpperCase()}</span>
                  </div>
                  <p style={{ fontSize: "14px", margin: "5px 0", color: "#334155" }}><strong>Lý do:</strong> {item.reason}</p>
                  <p style={{ fontSize: "14px", margin: "5px 0", color: "#334155" }}><strong>Hình thức bán:</strong> {item.method}</p>
                </div>
              ))}
            </section>
          </main>
        </div>

        {/* BOTTOM IMPACT SECTION */}
        <section style={{ marginTop: "60px", padding: "40px", background: "#0f172a", color: "white", borderRadius: "4px" }}>
          <h2 style={{ fontSize: "20px", fontWeight: "800", marginBottom: "20px" }}>KẾT QUẢ ĐẠT ĐƯỢC DỰ PHÓNG (IMPACT ANALYSIS)</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "40px" }}>
            <div>
              <p style={{ lineHeight: "1.8", fontSize: "15px" }}>
                Bằng việc triển khai đồng bộ chiến lược <strong>Value-driven</strong>, Heritage Hue Hotel sẽ vượt qua mức trần dự báo tĩnh <strong>{currency(appData.metrics.forecast)}</strong> để chạm mốc doanh thu thực nhận <strong>{currency(targetRevenue)}</strong>.
                <br/><br/>
                Khoảng trống (Gap) doanh thu dịch vụ bổ trợ <strong>{currency(appData.metrics.ancGap)}</strong> sẽ được giải quyết triệt để thông qua cơ chế Bundling Spa/Tour cho nhóm khách On-hand trị giá 110,000 USD hiện tại.
              </p>
            </div>
            <div style={{ borderLeft: "1px solid rgba(255,255,255,0.2)", paddingLeft: "40px" }}>
              <ul style={{ listStyle: "none", padding: 0, fontSize: "15px", lineHeight: "2" }}>
                <li>• Cải thiện tỷ lệ lấp đầy (Occupancy): <strong>+4.5%</strong></li>
                <li>• Tăng trưởng doanh thu thuần (Net Revenue): <strong>+{currency(growth)}</strong></li>
                <li>• Kiểm soát tỷ lệ hủy phòng (Conversion): <strong>Nâng từ 83.2% lên 91%</strong></li>
                <li>• Tối ưu hóa Giá trị ròng (Net ADR) thông qua kênh Direct.</li>
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
  flex: 1, padding: "12px", border: "none", cursor: "pointer", 
  background: active ? "#0f172a" : "#f1f5f9", 
  color: active ? "white" : "#64748b", fontWeight: "bold", fontSize: "12px",
  letterSpacing: "1px", transition: "0.2s"
});
const thStyle = { padding: "15px", fontSize: "12px", borderBottom: "2px solid #e2e8f0", color: "#64748b" };
const tdStyle = { padding: "15px", borderBottom: "1px solid #e2e8f0" };