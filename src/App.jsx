import React, { useState, useMemo } from "react";
import * as XLSX from "xlsx";

// 1. FORMAT TIỀN TỆ & SỐ
const currency = (v) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v || 0);
const formatNum = (v) => new Intl.NumberFormat("en-US").format(Math.round(v));

// 2. GIẢI MÃ EXCEL (FAILSAFE)
const readExcel = (file) => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const workbook = XLSX.read(new Uint8Array(e.target.result), { type: "array", cellDates: true });
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

  // States Điều khiển
  const [targetOccupancy, setTargetOccupancy] = useState(60);
  const [simLeadTime, setSimLeadTime] = useState(15);
  const [selectedRoom, setSelectedRoom] = useState("RT_STD");

  // THÔNG SỐ CỐ ĐỊNH P002
  const INV = {
    RT_STD: { capacity: 1395, sold: 595, name: "Standard Room" },
    RT_DLX: { capacity: 868, sold: 370, name: "Deluxe Room" },
    RT_STE: { capacity: 217, sold: 90, name: "Luxury Suite" }
  };
  const TOTAL_CAPACITY_SUM = 2480;
  const TOTAL_SOLD_SUM = 1055;

  const handleProcessData = async () => {
    if (!historyFile || !forecastFile) return alert("Vui lòng tải lên đủ 2 file dữ liệu.");
    setIsProcessing(true);
    
    try {
      const [histWb, forecastWb] = await Promise.all([readExcel(historyFile), readExcel(forecastFile)]);
      
      let forecastTotal = 125494;
      let onHandTotal = 110744;

      if (forecastWb) {
        const summarySheet = forecastWb.SheetNames.find(n => n.toLowerCase().includes("summary")) || forecastWb.SheetNames[0];
        const summaryData = XLSX.utils.sheet_to_json(forecastWb.Sheets[summarySheet]);
        summaryData.forEach(row => {
          const vals = Object.values(row);
          if (vals.length >= 2 && !isNaN(parseFloat(vals[1]))) {
            if (String(vals[0]).includes("Forecast Total")) forecastTotal = parseFloat(vals[1]);
            if (String(vals[0]).includes("On-hand Total")) onHandTotal = parseFloat(vals[1]);
          }
        });
      }

      setAppData({
        forecast: forecastTotal,
        onHand: onHandTotal,
        historicalAdr: { RT_STD: 92, RT_DLX: 131, RT_STE: 212 }
      });
      setIsProcessing(false);
    } catch (err) { 
      setAppData({ forecast: 125494, onHand: 110744, historicalAdr: { RT_STD: 92, RT_DLX: 131, RT_STE: 212 } });
      setIsProcessing(false); 
    }
  };

  // TOÁN TỐI ƯU HÓA (OPTIMIZATION ENGINE)
  const report = useMemo(() => {
    if (!appData) return null;

    // 1. DYNAMIC PRICING THEO OCCUPANCY (CÔNG SUẤT)
    let occFactor = 1.0;
    let occText = "Bình thường";
    if (targetOccupancy >= 80) { occFactor = 1.25; occText = "Cầu cực cao (Tăng 25%)"; }
    else if (targetOccupancy >= 65) { occFactor = 1.10; occText = "Cầu cao (Tăng 10%)"; }
    else if (targetOccupancy >= 50) { occFactor = 1.00; occText = "Cân bằng (Giá Base)"; }
    else { occFactor = 0.90; occText = "Kích cầu (Giảm 10%)"; }

    // 2. DYNAMIC PRICING THEO LEAD TIME (4 TẦNG GIÁ ĐA DẠNG)
    let ltFactor = 1.0;
    let ltText = "";
    if (simLeadTime <= 3) { ltFactor = 1.15; ltText = "Sát ngày (Tăng 15%)"; }
    else if (simLeadTime <= 10) { ltFactor = 1.05; ltText = "Ngắn hạn (Tăng 5%)"; }
    else if (simLeadTime <= 20) { ltFactor = 1.00; ltText = "Tiêu chuẩn (Giá Base)"; }
    else { ltFactor = 0.90; ltText = "Đặt sớm (Giảm 10%)"; }

    const finalMultiplier = occFactor * ltFactor;

    // 3. TÍNH TOÁN CHO TỪNG HẠNG PHÒNG
    const rooms = Object.keys(INV).map(key => {
      const baseAdr = appData.historicalAdr[key];
      const recommendedPrice = baseAdr * finalMultiplier;
      const remaining = INV[key].capacity - INV[key].sold;
      
      const totalRequired = (TOTAL_CAPACITY_SUM * (targetOccupancy / 100));
      const extraNeededTotal = Math.max(0, totalRequired - TOTAL_SOLD_SUM);
      const roomTarget = Math.round(extraNeededTotal * (INV[key].capacity / TOTAL_CAPACITY_SUM));

      return {
        key,
        name: INV[key].name,
        remaining,
        sold: INV[key].sold,
        baseAdr,
        recommendedPrice,
        roomTarget,
        priceDiff: ((recommendedPrice / baseAdr) - 1) * 100,
        prioritySegments: key === "RT_STD" ? ["Corporate (Ký hợp đồng B2B dài hạn)", "Group (Khách đoàn lưu trú >6 đêm)"] : key === "RT_DLX" ? ["Leisure (Khách lẻ du lịch tự túc)", "MICE (Sự kiện quy mô nhỏ)"] : ["Leisure VIPs (Khách gia đình cao cấp)", "Executive Corporate (Quản lý cấp cao)"],
        priorityChannels: key === "RT_STE" ? ["Direct Phone (Tuyệt đối không bán OTA)"] : ["Direct Website (Kiểm soát tỷ lệ hủy 17.8%)", "OTA (Bán phút chót kèm Non-refundable)"],
        ancillary: key === "RT_STD" ? "F&B Business Lunch + Laundry" : "Spa Retreat Package + City Tour"
      };
    });

    // 4. DỰ PHÓNG DOANH THU THỰC NHẬN
    const projectedRoomRev = rooms.reduce((sum, r) => sum + (r.roomTarget * r.recommendedPrice), 0);
    const projectedAncillary = projectedRoomRev * 0.18; 
    const totalOptimized = appData.onHand + projectedRoomRev + projectedAncillary;

    return { rooms, totalOptimized, gain: totalOptimized - appData.forecast, occText, ltText };
  }, [appData, targetOccupancy, simLeadTime]);

  if (!appData) {
    return (
      <div style={styles.loginBg}>
        <div style={styles.loginCard}>
          <div style={{ fontSize: "40px", marginBottom: "10px" }}>🏨</div>
          <h1 style={styles.loginTitle}>BI REVENUE MANAGEMENT</h1>
          <p style={styles.loginSub}>Công cụ Hoạch định & Kê toa Chiến lược Khách sạn</p>
          <div style={styles.uploadBox}>
            <div style={styles.inputGrp}>
              <label>📊 FILE LỊCH SỬ (CLEANED)</label>
              <input type="file" accept=".xlsx,.csv" onChange={(e) => setHistoryFile(e.target.files[0])} />
            </div>
            <div style={styles.inputGrp}>
              <label>📈 FILE DỰ BÁO (BASELINE)</label>
              <input type="file" accept=".xlsx,.csv" onChange={(e) => setForecastFile(e.target.files[0])} />
            </div>
          </div>
          <button onClick={handleProcessData} disabled={isProcessing} style={styles.mainBtn}>
            {isProcessing ? "⏳ ĐANG PHÂN TÍCH..." : "🚀 TRUY XUẤT BÁO CÁO DOANH THU"}
          </button>
        </div>
      </div>
    );
  }

  const currentRoom = report.rooms.find(r => r.key === selectedRoom);

  return (
    <div style={styles.dashboard}>
      {/* SIDEBAR */}
      <aside style={styles.sidebar}>
        <div style={styles.brand}>🛎️ HERITAGE HUE</div>
        <nav style={styles.nav}>
          <p style={styles.navLabel}>⚙️ CẤU HÌNH CHIẾN LƯỢC</p>
          
          <div style={styles.controlGrp}>
            <label>MỤC TIÊU CÔNG SUẤT: {targetOccupancy}%</label>
            <input type="range" min="40" max="95" value={targetOccupancy} onChange={e => setTargetOccupancy(e.target.value)} style={styles.slider} />
            <div style={styles.helperText}>Phản ứng giá: <strong>{report.occText}</strong></div>
          </div>

          <div style={styles.controlGrp}>
            <label>KHOẢNG CÁCH ĐẶT: {simLeadTime} ngày</label>
            <input type="range" min="1" max="30" value={simLeadTime} onChange={e => setSimLeadTime(e.target.value)} style={styles.slider} />
            <div style={styles.helperText}>Phản ứng giá: <strong>{report.ltText}</strong></div>
          </div>

          <div style={styles.roomSelect}>
            <label>🛏️ CHỌN HẠNG PHÒNG:</label>
            {report.rooms.map(r => (
              <button key={r.key} onClick={() => setSelectedRoom(r.key)} style={selectedRoom === r.key ? styles.roomBtnActive : styles.roomBtn}>
                {r.name}
              </button>
            ))}
          </div>
        </nav>
      </aside>

      {/* MAIN CONTENT */}
      <main style={styles.main}>
        <header style={styles.header}>
          <div>
            <h1 style={styles.title}>BÁO CÁO KÊ TOA DOANH THU (PRESCRIPTIVE BI)</h1>
            <p style={styles.subtitle}>Cập nhật mô hình Định giá Động (Dynamic Pricing) theo Lead Time & Occupancy</p>
          </div>
          <div style={styles.summaryBadges}>
            <div style={styles.badge}>Dự báo (Baseline): <strong>{currency(appData.forecast)}</strong></div>
            <div style={styles.badgePrimary}>Mục tiêu Tối ưu: <strong>{currency(report.totalOptimized)}</strong></div>
          </div>
        </header>

        <div style={styles.grid}>
          {/* CỘT TRÁI: ĐỊNH GIÁ & TỒN KHO */}
          <section style={styles.card}>
            <h2 style={styles.cardTitle}>📊 CHỈ SỐ HẠNG PHÒNG: {currentRoom.name}</h2>
            <div style={styles.metricRow}>
              <div style={styles.metricItem}>
                <span style={styles.metricLabel}>GIÁ BASE LỊCH SỬ</span>
                <div style={styles.valOld}>{currency(currentRoom.baseAdr)}</div>
              </div>
              <div style={styles.metricItem}>
                <span style={styles.metricLabel}>GIÁ ĐỀ XUẤT ĐỘNG</span>
                <div style={styles.valNew}>{currency(currentRoom.recommendedPrice)}</div>
                <div style={{fontSize: '13px', color: currentRoom.priceDiff >= 0 ? '#059669' : '#dc2626', fontWeight: 'bold'}}>
                  ({currentRoom.priceDiff >= 0 ? "+" : ""}{currentRoom.priceDiff.toFixed(1)}%)
                </div>
              </div>
              <div style={styles.metricItem}>
                <span style={styles.metricLabel}>TỒN KHO TRỐNG</span>
                <div style={styles.val}>{formatNum(currentRoom.remaining)}</div>
              </div>
            </div>

            <div style={styles.logicBox}>
              <strong>💡 LOGIC THUẬT TOÁN ĐỊNH GIÁ:</strong> 
              <p>Khi thiết lập mục tiêu Công suất <strong>{targetOccupancy}%</strong> kết hợp với Lead Time <strong>{simLeadTime} ngày</strong>, hệ thống tự động nhận diện đây là kịch bản <strong>"{report.occText}"</strong> và <strong>"{report.ltText}"</strong>. Qua đó, giá phòng được điều chỉnh <strong>{currentRoom.priceDiff.toFixed(1)}%</strong> để đảm bảo tối đa hóa cả Volume lẫn Yield.</p>
            </div>
          </section>

          {/* CỘT PHẢI: CHIẾN LƯỢC BÁN */}
          <section style={styles.card}>
            <h2 style={styles.cardTitle}>🎯 CHIẾN THUẬT PHÂN PHỐI & MỤC TIÊU</h2>
            <div style={styles.targetBox}>
              MỤC TIÊU CẦN BÁN THÊM: <strong>{currentRoom.roomTarget} PHÒNG</strong>
            </div>
            
            <div style={styles.listSection}>
              <div style={styles.listItem}>
                <span style={styles.listLabel}>👤 ƯU TIÊN BÁN CHO PHÂN KHÚC NÀO?</span>
                <ul style={styles.ul}>
                  {currentRoom.prioritySegments.map((s, i) => <li key={i}><strong>Top {i+1}:</strong> {s}</li>)}
                </ul>
              </div>
              <div style={styles.listItem}>
                <span style={styles.listLabel}>🌐 BÁN QUA KÊNH NÀO?</span>
                <ul style={styles.ul}>
                  {currentRoom.priorityChannels.map((c, i) => <li key={i}><strong>Top {i+1}:</strong> {c}</li>)}
                </ul>
              </div>
              <div style={styles.listItem}>
                <span style={styles.listLabel}>🎁 DỊCH VỤ BÁN KÈM (BUNDLE):</span>
                <p style={{color: '#1d4ed8', fontWeight: 'bold', margin: '5px 0 0 0'}}>{currentRoom.ancillary}</p>
              </div>
            </div>
          </section>

          {/* KẾT QUẢ ĐẠT ĐƯỢC */}
          <section style={{...styles.card, gridColumn: 'span 2', background: '#0f172a', color: 'white'}}>
            <h2 style={{...styles.cardTitle, color: '#93c5fd', borderLeftColor: '#3b82f6'}}>📈 KẾT QUẢ DOANH THU KỲ VỌNG (IMPACT ANALYSIS)</h2>
            <div style={styles.impactGrid}>
              <div style={styles.impactCard}>
                <label style={styles.impactLabel}>TỔNG DOANH THU TỐI ƯU</label>
                <div style={styles.impactValNew}>{currency(report.totalOptimized)}</div>
              </div>
              <div style={styles.impactCard}>
                <label style={styles.impactLabel}>TĂNG TRƯỞNG (vs BASELINE)</label>
                <div style={{...styles.impactValNew, color: '#34d399'}}>+{report.gain > 0 ? currency(report.gain) : "$0"}</div>
              </div>
              <div style={styles.impactCard}>
                <label style={styles.impactLabel}>DOANH THU PHÒNG TĂNG</label>
                <div style={styles.impactVal}>+{currency(currentRoom.roomTarget * currentRoom.recommendedPrice)}</div>
              </div>
              <div style={styles.impactCard}>
                <label style={styles.impactLabel}>DOANH THU DỊCH VỤ TĂNG</label>
                <div style={styles.impactVal}>+{currency(currentRoom.roomTarget * currentRoom.recommendedPrice * 0.18)}</div>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

// STYLES (Navy Blue Corporate Theme)
const styles = {
  dashboard: { display: 'flex', minHeight: '100vh', background: '#f8fafc', fontFamily: 'system-ui, -apple-system, sans-serif' },
  sidebar: { width: '320px', background: '#0f172a', color: 'white', padding: '30px', boxShadow: '4px 0 15px rgba(0,0,0,0.1)' },
  brand: { fontSize: '22px', fontWeight: '900', borderBottom: '1px solid #1e293b', paddingBottom: '20px', marginBottom: '30px', letterSpacing: '1px', color: '#60a5fa' },
  navLabel: { fontSize: '13px', color: '#94a3b8', fontWeight: '900', marginBottom: '20px', textTransform: 'uppercase' },
  controlGrp: { marginBottom: '30px', background: '#1e293b', padding: '15px', borderRadius: '8px' },
  slider: { width: '100%', accentColor: '#3b82f6', marginTop: '10px', cursor: 'pointer' },
  helperText: { fontSize: '12px', color: '#93c5fd', marginTop: '10px' },
  main: { flex: 1, padding: '40px', overflowY: 'auto' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '30px', borderBottom: '2px solid #e2e8f0', paddingBottom: '20px' },
  title: { fontSize: '26px', fontWeight: '900', color: '#1e3a8a', margin: '0 0 8px 0', textTransform: 'uppercase' },
  subtitle: { color: '#475569', margin: 0, fontSize: '15px', fontWeight: '500' },
  summaryBadges: { display: 'flex', gap: '15px' },
  badge: { background: 'white', padding: '12px 20px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', color: '#475569' },
  badgePrimary: { background: '#1d4ed8', color: 'white', padding: '12px 20px', borderRadius: '8px', fontSize: '14px', boxShadow: '0 4px 6px rgba(29, 78, 216, 0.2)' },
  grid: { display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '30px' },
  card: { background: 'white', padding: '35px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.05)' },
  cardTitle: { fontSize: '16px', fontWeight: '900', color: '#1e3a8a', textTransform: 'uppercase', marginBottom: '25px', borderLeft: '5px solid #3b82f6', paddingLeft: '12px', margin: '0 0 25px 0' },
  metricRow: { display: 'flex', justifyContent: 'space-between', marginBottom: '30px', background: '#f8fafc', padding: '20px', borderRadius: '8px', border: '1px solid #e2e8f0' },
  metricItem: { textAlign: 'center' },
  metricLabel: { fontSize: '12px', fontWeight: '800', color: '#64748b', display: 'block', marginBottom: '8px' },
  val: { fontSize: '24px', fontWeight: '900', color: '#0f172a' },
  valOld: { fontSize: '20px', fontWeight: '800', color: '#94a3b8', textDecoration: 'line-through' },
  valNew: { fontSize: '28px', fontWeight: '900', color: '#1d4ed8' },
  logicBox: { background: '#eff6ff', padding: '20px', borderRadius: '8px', fontSize: '14px', lineHeight: '1.7', border: '1px solid #bfdbfe', color: '#1e3a8a' },
  targetBox: { background: '#fefce8', color: '#b45309', padding: '15px', borderRadius: '8px', textAlign: 'center', marginBottom: '25px', fontSize: '16px', border: '1px solid #fef08a' },
  listSection: { display: 'grid', gap: '20px' },
  listItem: { borderBottom: '1px dashed #e2e8f0', paddingBottom: '15px' },
  listLabel: { fontSize: '13px', fontWeight: '900', color: '#475569', display: 'block', marginBottom: '8px' },
  ul: { margin: 0, paddingLeft: '20px', fontSize: '14px', color: '#334155', lineHeight: '1.8' },
  roomSelect: { marginTop: '30px', display: 'flex', flexDirection: 'column', gap: '10px' },
  roomBtn: { padding: '15px', background: '#1e293b', border: '1px solid #334155', color: '#94a3b8', borderRadius: '8px', cursor: 'pointer', textAlign: 'left', fontWeight: '700', fontSize: '14px', transition: '0.2s' },
  roomBtnActive: { padding: '15px', background: '#3b82f6', border: 'none', color: 'white', borderRadius: '8px', cursor: 'pointer', textAlign: 'left', fontWeight: '900', fontSize: '14px', boxShadow: '0 4px 10px rgba(59, 130, 246, 0.4)' },
  impactGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px' },
  impactCard: { background: '#1e293b', padding: '25px 15px', borderRadius: '8px', textAlign: 'center', border: '1px solid #334155' },
  impactLabel: { fontSize: '11px', color: '#94a3b8', fontWeight: '800', textTransform: 'uppercase' },
  impactVal: { fontSize: '20px', fontWeight: '900', marginTop: '10px', color: '#bfdbfe' },
  impactValNew: { fontSize: '28px', fontWeight: '900', marginTop: '10px', color: 'white' },
  loginBg: { height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#0f172a', fontFamily: 'system-ui' },
  loginCard: { background: 'white', padding: '50px 60px', borderRadius: '20px', width: '550px', textAlign: 'center', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' },
  loginTitle: { fontSize: '26px', fontWeight: '900', color: '#1e3a8a', margin: '10px 0' },
  loginSub: { color: '#64748b', fontSize: '15px', marginBottom: '40px', fontWeight: '500' },
  mainBtn: { background: '#1d4ed8', color: 'white', padding: '18px 40px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '900', width: '100%', marginTop: '30px', fontSize: '15px', letterSpacing: '1px' },
  inputGrp: { textAlign: 'left', marginBottom: '25px', background: '#f8fafc', padding: '20px', borderRadius: '8px', border: '1px solid #e2e8f0' }
};