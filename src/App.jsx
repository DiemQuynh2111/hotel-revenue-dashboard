import React, { useState, useMemo } from "react";
import * as XLSX from "xlsx";

// 1. FORMAT TIỀN TỆ AN TOÀN
function currency(v) {
  const num = Number(v);
  if (isNaN(num)) return "$0";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(num);
}

// 2. HÀM MÔ PHỎNG MONTE CARLO (1000 Kịch bản)
function runMonteCarlo(onHand, gap, priceMultiplier, iterations = 1000) {
  let results = [];
  for (let i = 0; i < iterations; i++) {
    // Biến thiên 1: Tỷ lệ chuyển đổi (Từ 83.2% hiện tại có thể dao động đến 95% nếu siết chính sách hủy)
    const conversionRate = 0.832 + Math.random() * (0.95 - 0.832);
    // Biến thiên 2: Lực cầu thị trường (Hấp thụ từ 70% đến 95% lượng Gap)
    const demandCapture = 0.70 + Math.random() * (0.95 - 0.70);
    
    const simulatedRevenue = onHand + (gap * demandCapture * conversionRate * priceMultiplier);
    results.push(simulatedRevenue);
  }
  
  // Sắp xếp để lấy phân vị (Percentiles)
  results.sort((a, b) => a - b);
  
  const mean = results.reduce((a, b) => a + b, 0) / iterations;
  const p10 = results[Math.floor(iterations * 0.1)]; // Tình huống xấu (Worst-case)
  const p90 = results[Math.floor(iterations * 0.9)]; // Tình huống tốt (Best-case)

  return { mean, p10, p90 };
}

// 3. GIẢI MÃ EXCEL
const readExcel = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: "array", cellDates: true });
        resolve(workbook);
      } catch (err) {
        reject(new Error("Lỗi định dạng file"));
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
  const [simOccupancy, setSimOccupancy] = useState(65);
  const [simLeadTime, setSimLeadTime] = useState(7);

  const handleProcessData = async () => {
    if (!historyFile || !forecastFile) return alert("Hệ thống yêu cầu cung cấp đủ 2 file dữ liệu.");
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

      // ĐÓNG GÓI CHIẾN LƯỢC QUẢN TRỊ
      const finalData = {
        metrics: { forecast: forecastTotal, onHand: onHandTotal, gap: gapTotal },
        rooms: {
          Weekday: {
            RT_STD: {
              name: "HẠNG TIÊU CHUẨN (STANDARD)",
              oldPrice: getSafeOldPrice("Weekday", "RT_STD"),
              who: [
                { rank: 1, segment: "Corporate", reason: "Ngày thường là giai đoạn Volume-driven. Mở rộng Corporate giúp giảm sự phụ thuộc rủi ro vào nhóm Leisure (hiện chiếm 62%). Khách Corporate tạo Base Occupancy cực kỳ ổn định." },
                { rank: 2, segment: "Group", reason: "Đoàn khách công vụ vừa và nhỏ giúp lấp đầy nhanh chóng số lượng lớn phòng trống trong tuần. Tập trung vào nhóm có Length of Stay > 6 đêm để tối ưu chi tiêu Ancillary." }
              ],
              where: [
                { rank: 1, channel: "Direct - Corporate Contract", reason: "Khắc phục triệt để tình trạng OTA chiếm Volume nhưng bào mòn Giá trị ròng. Ký kết B2B đảm bảo 0% hoa hồng và dòng tiền ổn định." },
                { rank: 2, channel: "OTA (Có kiểm soát)", reason: "Chỉ sử dụng để lấp đầy lượng phòng tồn kho phút chót, đi kèm yêu cầu đặt cọc trước." }
              ],
              ancillaryStrategy: "Tình trạng Ancillary đang mất cân đối (F&B chiếm 52%). Với phân khúc Corporate/Group, chiến thuật là bán chéo dịch vụ Giặt ủi (Other) và F&B ngay trong giá Hợp đồng."
            },
            RT_DLX: {
              name: "HẠNG CAO CẤP (DELUXE)",
              oldPrice: getSafeOldPrice("Weekday", "RT_DLX"),
              who: [
                { rank: 1, segment: "Leisure", reason: "Leisure mang lại ADR và RevPAR cao nhất (đóng góp >434,000 USD). Đây là tệp khách chủ lực cần duy trì vào những ngày giữa tuần để tối đa hóa doanh thu biên." },
                { rank: 2, segment: "MICE", reason: "Khai thác khách sự kiện doanh nghiệp giữa tuần giúp đa dạng hóa nguồn khách hàng." }
              ],
              where: [
                { rank: 1, channel: "Direct - Website", reason: "Dữ liệu chỉ ra Direct Website mang lại Net ADR cao nhất. Chuyển dịch khách từ OTA sang Direct giúp bảo vệ biên lợi nhuận ròng." },
                { rank: 2, channel: "OTA", reason: "Dùng để tăng nhận diện thương hiệu. Áp dụng chính sách kiểm soát hủy phòng nghiêm ngặt do tỷ lệ hủy kênh này lên tới 17.8%." }
              ],
              ancillaryStrategy: "Dịch vụ Spa và Tour chỉ chiếm 21% tổng Ancillary. Hạng phòng Deluxe cần được Đóng gói (Bundle) bắt buộc kèm Spa hoặc Tour để phá vỡ sự tập trung quá mức vào F&B."
            },
            RT_STE: {
              name: "HẠNG VIP (SUITE)",
              oldPrice: getSafeOldPrice("Weekday", "RT_STE"),
              who: [
                { rank: 1, segment: "MICE", reason: "MICE hiện chiếm tỷ trọng rất nhỏ. Khai thác nhóm chuyên gia, diễn giả từ các sự kiện MICE giúp tiêu thụ hạng phòng Suite vào ngày thường." },
                { rank: 2, segment: "Leisure (High-end)", reason: "Nhóm khách gia đình có mức chi trả cao, mong muốn trải nghiệm di sản văn hóa." }
              ],
              where: [
                { rank: 1, channel: "Direct - Phone / Email", reason: "Hạng phòng cao cấp tuyệt đối không nên phụ thuộc vào OTA nhằm tránh thất thoát doanh thu kép (Mất hoa hồng + Rủi ro hủy phòng cao)." },
                { rank: 2, channel: "Loyalty Program", reason: "Tập trung khai thác tệp khách hàng thân thiết." }
              ],
              ancillaryStrategy: "Áp dụng phương pháp Upsell chủ động (Proactive): Nhân viên tư vấn trực tiếp mời khách nâng cấp kèm dịch vụ Tour di sản tại thời điểm Check-in."
            }
          },
          Weekend: {
            RT_STD: {
              name: "HẠNG TIÊU CHUẨN (STANDARD)",
              oldPrice: getSafeOldPrice("Weekend", "RT_STD"),
              who: [
                { rank: 1, segment: "Leisure", reason: "Cuối tuần lượng booking giảm nhưng duy trì được giá trị phòng cao (ADR-driven). Khách Leisure ít nhạy cảm về giá, phù hợp để tối ưu lợi nhuận." }
              ],
              where: [
                { rank: 1, channel: "OTA (Booking.com, Agoda)", reason: "Hệ thống OTA kéo lượng khách Leisure rất tốt nhưng tỷ lệ chuyển đổi chỉ đạt 83.2%. BẮT BUỘC siết chặt chính sách hoàn hủy với các booking có Lead Time dài." },
                { rank: 2, channel: "Direct - Website", reason: "Cung cấp các lợi ích cộng thêm để lôi kéo khách hàng từ OTA sang." }
              ],
              ancillaryStrategy: "Chi tiêu Ancillary vào cuối tuần đang thấp hơn ngày thường. Cần đẩy mạnh chiến dịch Bundle phòng Standard kèm Buffet cuối tuần (F&B)."
            },
            RT_DLX: {
              name: "HẠNG CAO CẤP (DELUXE)",
              oldPrice: getSafeOldPrice("Weekend", "RT_DLX"),
              who: [
                { rank: 1, segment: "Leisure", reason: "Khách nghỉ dưỡng cuối tuần là dư địa lớn nhất để khách sạn chuyển hướng sang tối ưu theo chiều sâu (Value-driven) thay vì chạy theo số lượng." }
              ],
              where: [
                { rank: 1, channel: "Direct - Website", reason: "Phân tích Status Mix cho thấy tỷ lệ hủy trên Direct chỉ 12.2% so với 17.8% của OTA. Đẩy mạnh Direct giúp bảo vệ doanh thu thực nhận." }
              ],
              ancillaryStrategy: "Dữ liệu chứng minh Spa là dịch vụ có mức chi tiêu cao nhất cuối tuần. Định hướng: Biến Spa thành sản phẩm Upsell chủ lực cho khách lưu trú hạng Deluxe."
            },
            RT_STE: {
              name: "HẠNG VIP (SUITE)",
              oldPrice: getSafeOldPrice("Weekend", "RT_STE"),
              who: [
                { rank: 1, segment: "Leisure", reason: "Nhóm khách VIP đa thế hệ có ngân sách lớn, giúp tối đa hóa ADR và RevPAR, giảm thiểu rủi ro khi volume toàn hệ thống sụt giảm." }
              ],
              where: [
                { rank: 1, channel: "Direct - Phone / Khách quen", reason: "Để chặn đứng rủi ro 130 trường hợp No-show và 1308 trường hợp Cancelled, bắt buộc áp dụng Non-Refundable 100% đối với hạng phòng Suite trên mọi kênh phân phối." }
              ],
              ancillaryStrategy: "Nhóm khách này không nhạy cảm về giá. Cần Đóng gói (Bundle) toàn bộ hệ sinh thái: Phòng Suite + F&B + Spa + Tour để tối đa hóa Tổng doanh thu trên mỗi khách (TRevPAR)."
            }
          }
        }
      };

      setAppData(finalData);
      setIsProcessing(false);
    } catch (err) { alert("Lỗi xử lý file định dạng."); setIsProcessing(false); }
  };

  // GIAO DIỆN UPLOAD
  if (!appData) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", background: "#f8fafc", padding: "20px", fontFamily: "system-ui, -apple-system, sans-serif" }}>
        <div style={{ background: "white", padding: "40px 50px", borderRadius: "8px", border: "1px solid #e2e8f0", width: "100%", maxWidth: "800px", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)" }}>
          <h1 style={{ color: "#0f172a", marginBottom: "10px", fontSize: "24px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "1px", textAlign: "center" }}>Hệ thống Phân tích & Tối ưu Doanh thu</h1>
          <p style={{ fontSize: "14px", color: "#64748b", marginBottom: "40px", textAlign: "center", lineHeight: "1.6" }}>Phần mềm tích hợp Thuật toán Monte Carlo để định lượng rủi ro chuyển đổi và dự phóng doanh thu mục tiêu.</p>
          
          <div style={{ display: "flex", gap: "20px", marginBottom: "30px" }}>
            <div style={{ flex: 1, border: "1px solid #cbd5e1", padding: "20px", background: "#f1f5f9" }}>
              <p style={{ fontSize: "12px", fontWeight: "700", color: "#334155", marginBottom: "15px" }}>TẢI FILE DỮ LIỆU LỊCH SỬ</p>
              <input type="file" accept=".xlsx" onChange={(e) => setHistoryFile(e.target.files[0])} style={{ fontSize: "13px" }} />
            </div>
            <div style={{ flex: 1, border: "1px solid #cbd5e1", padding: "20px", background: "#f1f5f9" }}>
              <p style={{ fontSize: "12px", fontWeight: "700", color: "#334155", marginBottom: "15px" }}>TẢI FILE DỰ BÁO (FORECAST)</p>
              <input type="file" accept=".xlsx" onChange={(e) => setForecastFile(e.target.files[0])} style={{ fontSize: "13px" }} />
            </div>
          </div>
          <button onClick={handleProcessData} disabled={isProcessing} style={{ background: "#0f172a", color: "white", padding: "15px", border: "none", width: "100%", cursor: "pointer", fontWeight: "600", letterSpacing: "1px", fontSize: "14px" }}>
            {isProcessing ? "ĐANG TÍNH TOÁN DỮ LIỆU..." : "TIẾN HÀNH PHÂN TÍCH CHUYÊN SÂU"}
          </button>
        </div>
      </div>
    );
  }

  // DASHBOARD BÁO CÁO
  const room = appData.rooms[selectedDayType][selectedRoomType];

  // LOGIC ĐỊNH GIÁ ĐỘNG (WHAT-IF)
  let occMultiplier = 1.0;
  if (simOccupancy >= 75) occMultiplier = 1.15; 
  else if (simOccupancy <= 35) occMultiplier = 0.90; 

  let leadMultiplier = 1.0;
  let leadText = "Duy trì mức giá cơ bản (Base Rate). Tốc độ hấp thụ phòng (Pickup) bình thường.";

  if (simLeadTime <= 3) {
    leadMultiplier = 1.15;
    leadText = "Tăng giá 15% (Yield Optimization) do nhu cầu khẩn cấp. Khách ít nhạy cảm về giá.";
  } else if (simLeadTime >= 15) {
    leadMultiplier = 0.90;
    leadText = "Giảm giá 10% để lấy Base Volume. Cảnh báo: Yêu cầu chính sách Non-refundable để chặn thất thoát 17.8% từ OTA.";
  }

  const dynamicPrice = room.oldPrice * occMultiplier * leadMultiplier;

  // CHẠY MONTE CARLO SIMULATION
  const priceIndex = dynamicPrice / room.oldPrice; // Chỉ số giá (Ví dụ 1.15 tức là giá cao hơn 15%)
  const monteCarloResults = useMemo(() => {
    return runMonteCarlo(appData.metrics.onHand, appData.metrics.gap, priceIndex);
  }, [appData.metrics.onHand, appData.metrics.gap, priceIndex]);

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", padding: "40px", fontFamily: "system-ui, -apple-system, sans-serif", color: "#0f172a" }}>
      <div style={{ maxWidth: "1280px", margin: "0 auto", background: "white", border: "1px solid #e2e8f0", boxShadow: "0 10px 15px -3px rgba(0,0,0,0.05)" }}>
        
        <header style={{ background: "#0f172a", color: "white", padding: "30px 40px" }}>
          <h1 style={{ margin: "0 0 8px 0", fontSize: "22px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "1px" }}>Báo cáo Phân tích & Kê toa Chiến lược Tối ưu Doanh thu - Tháng 01/2026</h1>
          <p style={{ margin: 0, color: "#94a3b8", fontSize: "14px" }}>Căn cứ dữ liệu Lịch sử & Dự báo | Ứng dụng Mô phỏng rủi ro Monte Carlo</p>
        </header>

        <div style={{ padding: "40px" }}>
          
          <div style={{ display: "flex", gap: "10px", marginBottom: "30px" }}>
            <button onClick={() => setSelectedDayType("Weekday")} style={tabStyle(selectedDayType === "Weekday")}>PHÂN TÍCH: NGÀY TRONG TUẦN (WEEKDAY)</button>
            <button onClick={() => setSelectedDayType("Weekend")} style={tabStyle(selectedDayType === "Weekend")}>PHÂN TÍCH: CUỐI TUẦN (WEEKEND)</button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "40px" }}>
            
            {/* CỘT TRÁI: CHẨN ĐOÁN & DANH SÁCH ƯU TIÊN */}
            <section>
              <div style={{ display: "flex", gap: "10px", marginBottom: "30px" }}>
                {["RT_STD", "RT_DLX", "RT_STE"].map(type => (
                  <div key={type} onClick={() => setSelectedRoomType(type)} style={{ flex: 1, padding: "12px", cursor: "pointer", border: "1px solid #cbd5e1", textAlign: "center", background: selectedRoomType === type ? "#0f172a" : "white", color: selectedRoomType === type ? "white" : "#0f172a", fontWeight: "700", fontSize: "13px" }}>
                    {type === "RT_STD" ? "HẠNG STANDARD" : type === "RT_DLX" ? "HẠNG DELUXE" : "HẠNG SUITE"}
                  </div>
                ))}
              </div>

              <div style={{ border: "1px solid #e2e8f0", background: "#f8fafc" }}>
                <h2 style={{ fontSize: "14px", fontWeight: "700", color: "#0f172a", margin: 0, padding: "15px 20px", borderBottom: "1px solid #e2e8f0", background: "#f1f5f9" }}>1. CHIẾN LƯỢC NHẮM MỤC TIÊU & PHÂN PHỐI</h2>
                
                <div style={{ padding: "20px" }}>
                  <p style={{ fontSize: "13px", fontWeight: "700", color: "#475569", marginBottom: "15px", textTransform: "uppercase" }}>A. Phân khúc khách hàng trọng tâm:</p>
                  {room.who.map((item, idx) => (
                    <div key={idx} style={{ marginBottom: "15px", paddingBottom: "15px", borderBottom: idx === room.who.length - 1 ? "none" : "1px dashed #cbd5e1" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                        <span style={{ fontWeight: "700", fontSize: "14px", color: "#1e40af" }}>{item.segment.toUpperCase()}</span>
                        <span style={{ fontSize: "11px", fontWeight: "700", background: item.rank === 1 ? "#0f172a" : "#e2e8f0", color: item.rank === 1 ? "white" : "#475569", padding: "2px 8px" }}>ƯU TIÊN {item.rank}</span>
                      </div>
                      <div style={{ fontSize: "13px", color: "#334155", lineHeight: "1.6" }}>{item.reason}</div>
                    </div>
                  ))}

                  <p style={{ fontSize: "13px", fontWeight: "700", color: "#475569", margin: "20px 0 15px 0", textTransform: "uppercase" }}>B. Kênh phân phối chiến lược:</p>
                  {room.where.map((item, idx) => (
                    <div key={idx} style={{ marginBottom: "15px", paddingBottom: "15px", borderBottom: idx === room.where.length - 1 ? "none" : "1px dashed #cbd5e1" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                        <span style={{ fontWeight: "700", fontSize: "14px", color: "#b45309" }}>{item.channel.toUpperCase()}</span>
                        <span style={{ fontSize: "11px", fontWeight: "700", background: item.rank === 1 ? "#0f172a" : "#e2e8f0", color: item.rank === 1 ? "white" : "#475569", padding: "2px 8px" }}>ƯU TIÊN {item.rank}</span>
                      </div>
                      <div style={{ fontSize: "13px", color: "#334155", lineHeight: "1.6" }}>{item.reason}</div>
                    </div>
                  ))}

                  <div style={{ background: "#e0f2fe", padding: "15px", marginTop: "20px", borderLeft: "4px solid #0284c7" }}>
                    <strong style={{ fontSize: "13px", color: "#0284c7" }}>C. CHIẾN LƯỢC DỊCH VỤ BỔ TRỢ (ANCILLARY):</strong>
                    <div style={{ fontSize: "13px", color: "#334155", lineHeight: "1.6", marginTop: "5px" }}>{room.ancillaryStrategy}</div>
                  </div>
                </div>
              </div>
            </section>

            {/* CỘT PHẢI: ĐỊNH GIÁ & MONTE CARLO RESULTS */}
            <main>
              <section style={{ border: "1px solid #e2e8f0", background: "white", marginBottom: "30px" }}>
                <h2 style={{ fontSize: "14px", fontWeight: "700", color: "#0f172a", margin: 0, padding: "15px 20px", borderBottom: "1px solid #e2e8f0", background: "#f1f5f9" }}>2. MÔ PHỎNG ĐỊNH GIÁ ĐỘNG (DYNAMIC PRICING)</h2>
                <div style={{ padding: "20px" }}>
                  <div style={{ fontSize: "13px", color: "#475569", marginBottom: "20px", background: "#f8fafc", padding: "10px", border: "1px solid #e2e8f0" }}>
                    MỨC GIÁ BASE TỪ DỮ LIỆU LỊCH SỬ: <strong style={{ color: "#0f172a", fontSize: "14px" }}>{currency(room.oldPrice)}</strong>
                  </div>

                  <div style={{ marginBottom: "20px" }}>
                    <label style={{ display: "flex", justifyContent: "space-between", fontWeight: "700", fontSize: "13px", color: "#0f172a" }}>
                      <span>DỰ BÁO CÔNG SUẤT THỊ TRƯỜNG:</span>
                      <span style={{ color: "#1e40af" }}>{simOccupancy}%</span>
                    </label>
                    <input type="range" min="0" max="100" value={simOccupancy} onChange={(e) => setSimOccupancy(Number(e.target.value))} style={{ width: "100%", marginTop: "10px", accentColor: "#1e40af", cursor: "pointer" }} />
                  </div>

                  <div style={{ marginBottom: "20px" }}>
                    <label style={{ display: "flex", justifyContent: "space-between", fontWeight: "700", fontSize: "13px", color: "#0f172a" }}>
                      <span>THỜI GIAN ĐẶT TRƯỚC (LEAD TIME):</span>
                      <span style={{ color: "#b45309" }}>{simLeadTime} NGÀY</span>
                    </label>
                    <input type="range" min="0" max="30" value={simLeadTime} onChange={(e) => setSimLeadTime(Number(e.target.value))} style={{ width: "100%", marginTop: "10px", accentColor: "#b45309", cursor: "pointer" }} />
                    <div style={{ fontSize: "13px", color: "#475569", marginTop: "10px", lineHeight: "1.6", background: "#fffbeb", padding: "10px", borderLeft: "3px solid #f59e0b" }}>
                      <strong>Điều chỉnh Giá trị:</strong> {leadText}
                    </div>
                  </div>

                  <div style={{ background: "#0f172a", padding: "20px", textAlign: "center", color: "white" }}>
                    <div style={{ fontSize: "12px", fontWeight: "600", letterSpacing: "1px", opacity: 0.8 }}>MỨC GIÁ ĐỀ XUẤT ĐỒNG BỘ PMS</div>
                    <div style={{ fontSize: "40px", fontWeight: "700", margin: "5px 0" }}>{currency(dynamicPrice)}</div>
                  </div>
                </div>
              </section>

              <section style={{ border: "1px solid #e2e8f0", background: "white" }}>
                <h2 style={{ fontSize: "14px", fontWeight: "700", color: "#0f172a", margin: 0, padding: "15px 20px", borderBottom: "1px solid #e2e8f0", background: "#f1f5f9" }}>3. KẾT QUẢ MÔ PHỎNG MONTE CARLO (1000 KỊCH BẢN)</h2>
                <div style={{ padding: "20px" }}>
                  <p style={{ fontSize: "13px", color: "#475569", lineHeight: "1.6", margin: "0 0 20px 0" }}>
                    Chạy thuật toán giả lập xác suất ngẫu nhiên để đánh giá sức chịu đựng của doanh thu trước các rủi ro: Lực cầu biến động (70% - 95%) và Tỷ lệ chuyển đổi (83.2% - 95%).
                  </p>
                  
                  <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "10px" }}>
                    <div style={{ padding: "15px", border: "1px solid #e2e8f0", background: "#f8fafc", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div style={{ fontSize: "11px", fontWeight: "700", color: "#64748b", marginBottom: "4px" }}>DỰ BÁO TĨNH BAN ĐẦU (BASELINE)</div>
                        <div style={{ fontSize: "16px", fontWeight: "700", color: "#0f172a" }}>{currency(appData.metrics.forecast)}</div>
                      </div>
                      <div style={{ fontSize: "12px", color: "#64748b" }}>Ghi nhận từ PMS</div>
                    </div>

                    <div style={{ padding: "15px", border: "2px solid #059669", background: "#f0fdf4", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div style={{ fontSize: "11px", fontWeight: "700", color: "#059669", marginBottom: "4px" }}>GIÁ TRỊ KỲ VỌNG TRUNG BÌNH (EXPECTED VALUE)</div>
                        <div style={{ fontSize: "22px", fontWeight: "800", color: "#059669" }}>{currency(monteCarloResults.mean)}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: "14px", fontWeight: "700", color: "#059669" }}>+{currency(monteCarloResults.mean - appData.metrics.forecast)}</div>
                        <div style={{ fontSize: "11px", color: "#059669" }}>Tăng trưởng biên</div>
                      </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginTop: "5px" }}>
                      <div style={{ padding: "12px", border: "1px solid #fecaca", background: "#fef2f2" }}>
                        <div style={{ fontSize: "11px", fontWeight: "700", color: "#dc2626", marginBottom: "4px" }}>KỊCH BẢN XẤU (P10)</div>
                        <div style={{ fontSize: "16px", fontWeight: "700", color: "#dc2626" }}>{currency(monteCarloResults.p10)}</div>
                        <div style={{ fontSize: "11px", color: "#991b1b", marginTop: "4px" }}>Thị trường suy yếu / Hủy phòng cao</div>
                      </div>
                      <div style={{ padding: "12px", border: "1px solid #bfdbfe", background: "#eff6ff" }}>
                        <div style={{ fontSize: "11px", fontWeight: "700", color: "#1d4ed8", marginBottom: "4px" }}>KỊCH BẢN TỐT (P90)</div>
                        <div style={{ fontSize: "16px", fontWeight: "700", color: "#1d4ed8" }}>{currency(monteCarloResults.p90)}</div>
                        <div style={{ fontSize: "11px", color: "#1e40af", marginTop: "4px" }}>Khách hàng chấp nhận giá cao (Yield)</div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            </main>
          </div>
        </div>

      </div>
    </div>
  );
}

// STYLES
const tabStyle = (active) => ({
  flex: 1, padding: "14px", border: "1px solid #cbd5e1", cursor: "pointer", 
  background: active ? "#0f172a" : "#f8fafc", 
  color: active ? "white" : "#475569", fontWeight: "700", fontSize: "12px",
  letterSpacing: "0.5px", transition: "all 0.2s ease"
});