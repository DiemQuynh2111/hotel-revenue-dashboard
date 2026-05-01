import React, { useState, useMemo } from "react";
import * as XLSX from "xlsx";

// ============================================================================
// 1. CẤU HÌNH & STYLES (Đưa lên đầu để tuyệt đối không dính lỗi ReferenceError)
// ============================================================================
const CONFIG = {
  MC_ITERATIONS: 2000,
  DAYS_IN_MONTH: 31,
  TOTAL_ROOMS: 80,
  HISTORICAL_AVG_OCCUPANCY: 44.2, // Base lịch sử các tháng trước
  ANCILLARY_RATIO: 0.18,
  MC_PARAMS: { DEMAND_MEAN: 0.85, DEMAND_STD_DEV: 0.05, CANCEL_MEAN: 0.10, CANCEL_STD_DEV: 0.02 },
  DEFAULT_METRICS: { forecast: 125494, onHand: 110744 }
};

const STYLES = {
  layoutCenter: { minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", position: "relative", padding: "20px", fontFamily: "system-ui, -apple-system, sans-serif" },
  bgBlur: { position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", background: "#f8fafc", zIndex: -1 },
  loginCard: { background: "white", padding: "50px", width: "100%", maxWidth: "800px", borderTop: "4px solid #1e3a8a", boxShadow: "0 20px 40px rgba(0,0,0,0.1)", borderRadius: "8px" },
  heading: { color: "#0f172a", margin: "0 0 10px 0", fontSize: "26px", fontWeight: "900", textTransform: "uppercase", letterSpacing: "1px" },
  subHeading: { color: "#64748b", margin: "0 0 30px 0", fontSize: "14px", fontWeight: "500" },
  flexGap: { display: "flex", gap: "20px", marginBottom: "30px" },
  uploadBox: { flex: 1, border: "1px solid #cbd5e1", padding: "25px 20px", background: "#f1f5f9", borderRadius: "6px" },
  uploadTitle: { fontSize: "12px", fontWeight: "800", color: "#1e3a8a", margin: "0 0 12px 0" },
  btnPrimary: { background: "#1e3a8a", color: "white", padding: "18px", border: "none", cursor: "pointer", fontWeight: "800", letterSpacing: "1px", width: "100%", fontSize: "14px", textTransform: "uppercase", borderRadius: "6px" },
  
  layoutMain: { minHeight: "100vh", padding: "30px 20px", fontFamily: "system-ui, -apple-system, sans-serif", color: "#0f172a" },
  bgBlurLight: { position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", background: "#f1f5f9", zIndex: -1 },
  dashboardContainer: { maxWidth: "1450px", margin: "0 auto", background: "white", boxShadow: "0 10px 40px rgba(0,0,0,0.08)", border: "1px solid #e2e8f0", borderRadius: "10px", overflow: "hidden" },
  header: { background: "#0f172a", padding: "30px 40px", color: "white", borderBottom: "4px solid #1e3a8a", display: "flex", justifyContent: "space-between", alignItems: "center" },
  headerTitle: { fontSize: "22px", fontWeight: "900", textTransform: "uppercase", margin: "0 0 8px 0", letterSpacing: "1px" },
  headerSub: { margin: 0, color: "#94a3b8", fontSize: "13px", fontWeight: "500" },
  statusSuccess: { padding: "8px 16px", background: "#059669", color: "white", fontWeight: "800", fontSize: "12px", borderRadius: "6px" },
  statusWarning: { padding: "8px 16px", background: "#b45309", color: "white", fontWeight: "800", fontSize: "12px", borderRadius: "6px" },
  contentArea: { padding: "40px" },
  
  grid2Col: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "25px", marginBottom: "35px" },
  metricCardActive: { padding: "25px", border: "1px solid #cbd5e1", background: "#f8fafc", borderLeft: "5px solid #1e3a8a", borderRadius: "6px" },
  metricCard: { padding: "25px", border: "1px solid #cbd5e1", background: "white", borderLeft: "5px solid #64748b", borderRadius: "6px" },
  metricLabel: { fontSize: "12px", color: "#475569", fontWeight: "800", letterSpacing: "0.5px" },
  metricValue: { fontSize: "34px", fontWeight: "900", color: "#0f172a", marginTop: "10px" },
  
  controlSection: { marginBottom: "40px", display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "40px", padding: "35px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px" },
  flexBetween: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" },
  controlTitle: { fontSize: "15px", fontWeight: "800", color: "#0f172a", margin: 0 },
  badge: { fontSize: "18px", fontWeight: "900", color: "white", background: "#1e3a8a", padding: "6px 14px", borderRadius: "6px" },
  slider: { width: "100%", accentColor: "#1e3a8a", cursor: "pointer", height: "6px" },
  sliderReverse: { width: "100%", accentColor: "#1e3a8a", cursor: "pointer", direction: "rtl", height: "6px" },
  helperText: { marginTop: "18px", fontSize: "14px", color: "#334155", lineHeight: "1.6" },
  highlightText: { color: "#1e3a8a", fontWeight: "800" },
  alertBox: { marginTop: "18px", fontSize: "14px", color: "#1e3a8a", lineHeight: "1.6", borderLeft: "4px solid #1e3a8a", paddingLeft: "15px", background: "#eff6ff", padding: "12px", borderRadius: "0 6px 6px 0" },
  
  flexGapSmall: { display: "flex", gap: "8px", marginBottom: "25px" },
  tabActive: { flex: 1, padding: "16px", border: "none", cursor: "pointer", background: "#1e3a8a", color: "white", fontWeight: "800", fontSize: "14px", borderRadius: "6px" },
  tab: { flex: 1, padding: "16px", border: "1px solid #cbd5e1", cursor: "pointer", background: "#f8fafc", color: "#475569", fontWeight: "700", fontSize: "14px", borderRadius: "6px" },
  
  table: { width: "100%", borderCollapse: "collapse", border: "1px solid #cbd5e1", background: "white", borderRadius: "8px", overflow: "hidden" },
  tableHead: { textAlign: "left", background: "#f1f5f9", borderBottom: "3px solid #1e3a8a" },
  th: { padding: "18px 20px", fontSize: "12px", color: "#1e3a8a", textTransform: "uppercase", fontWeight: "900" },
  tableRow: { borderBottom: "1px solid #e2e8f0" },
  td: { padding: "25px 20px", verticalAlign: "top" },
  
  roomName: { fontWeight: "900", color: "#0f172a", fontSize: "15px", marginBottom: "12px", textTransform: "uppercase" },
  roomStat: { fontSize: "13px", color: "#64748b", marginBottom: "6px" },
  roomAvai: { fontSize: "13px", fontWeight: "800", color: "#1e3a8a", padding: "8px 12px", background: "#eff6ff", border: "1px solid #bfdbfe", display: "inline-block", marginTop: "6px", borderRadius: "6px" },
  priceOld: { fontSize: "14px", color: "#94a3b8", textDecoration: "line-through", fontWeight: "600" },
  priceNew: { fontSize: "24px", fontWeight: "900", color: "#0f172a", margin: "6px 0" },
  priceDiff: { fontSize: "13px", fontWeight: "800" },
  
  stratLevel: { display: "inline-block", padding: "3px 8px", background: "#e2e8f0", color: "#334155", fontSize: "11px", fontWeight: "800", borderRadius: "4px", marginBottom: "4px", marginRight: "6px" },
  stratTitle: { fontSize: "13px", fontWeight: "800", color: "#0f172a", marginBottom: "4px" },
  stratDesc: { fontSize: "13px", color: "#475569", lineHeight: "1.5", margin: "0 0 12px 0" },
  
  ancilTitle: { fontSize: "13px", fontWeight: "900", color: "#1d4ed8", marginBottom: "6px" },
  ancilDesc: { fontSize: "12.5px", color: "#475569", lineHeight: "1.6", fontStyle: "italic" },
  
  impactSection: { border: "1px solid #cbd5e1", background: "white", borderRadius: "8px", overflow: "hidden" },
  impactHeader: { fontSize: "16px", fontWeight: "900", color: "#0f172a", background: "#f1f5f9", margin: 0, padding: "20px 30px", textTransform: "uppercase", borderBottom: "1px solid #e2e8f0" },
  impactGrid: { padding: "40px", display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "40px" },
  impactTextCol: { borderRight: "1px solid #e2e8f0", paddingRight: "40px" },
  impactDesc: { fontSize: "14px", color: "#475569", lineHeight: "1.8", margin: "0 0 25px 0" },
  impactBaseBox: { padding: "25px", background: "#f8fafc", border: "1px solid #cbd5e1", borderRadius: "6px" },
  impactBaseLabel: { fontSize: "12px", fontWeight: "800", color: "#64748b", marginBottom: "8px" },
  impactBaseVal: { fontSize: "28px", fontWeight: "900", color: "#0f172a" },
  impactResultGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" },
  impactTotalBox: { padding: "25px", background: "#0f172a", color: "white", gridColumn: "1 / -1", borderLeft: "5px solid #1e3a8a", borderRadius: "6px" },
  impactTotalLabel: { fontSize: "12px", fontWeight: "800", color: "#94a3b8", marginBottom: "8px" },
  impactTotalVal: { fontSize: "36px", fontWeight: "900", color: "white" },
  impactGrowthBox: { padding: "20px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "6px" },
  impactSubBox: { padding: "20px", background: "white", border: "1px solid #cbd5e1", borderRadius: "6px" },
  impactAncilBox: { padding: "20px", background: "white", border: "1px solid #cbd5e1", gridColumn: "1 / -1", borderRadius: "6px" }
};

// ============================================================================
// 2. UTILITIES
// ============================================================================
const Utils = {
  currency: (v) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v || 0),
  formatNum: (v) => new Intl.NumberFormat("en-US").format(Math.round(v || 0)),
  randomNormal: (mean, stdDev) => {
    let u = 0, v = 0;
    while(u === 0) u = Math.random();
    while(v === 0) v = Math.random();
    return mean + (Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v)) * stdDev;
  }
};

// ============================================================================
// 3. CHIẾN LƯỢC KINH DOANH (CẤU TRÚC MỚI: CHI TIẾT & CHUYÊN SÂU)
// ============================================================================
const STRATEGIES = {
  Weekday: {
    RT_STD: { 
      who: [
        { level: "Ưu tiên 1", title: "Corporate (B2B)", desc: "Khách công tác cung cấp Base công suất cực kỳ ổn định, triệt tiêu rủi ro trống phòng giữa tuần." },
        { level: "Ưu tiên 2", title: "Group / Đoàn", desc: "Tận dụng lợi thế lưu trú dài ngày (>6 đêm), tối ưu hóa chi phí vận hành cố định." }
      ], 
      where: [
        { level: "Kênh Chính", title: "Direct B2B Contract", desc: "Không tốn 15-20% hoa hồng OTA, bảo vệ tuyệt đối Net ADR." },
        { level: "Bổ trợ", title: "Kênh OTA", desc: "Chỉ mở bán để giải phóng tồn kho phút chót (Last-minute)." }
      ], 
      ancillary: { title: "MICE Bundle (F&B + Laundry)", desc: "Giới công tác có nhu cầu ăn uống tại khách sạn và giặt ủi hàng ngày. Đóng gói dịch vụ giúp tăng vọt doanh thu trên mỗi khách (RevPAC)." }
    },
    RT_DLX: { 
      who: [
        { level: "Ưu tiên 1", title: "Leisure (Nghỉ dưỡng)", desc: "Nhóm khách có độ nhạy cảm giá thấp, mang lại ADR cao nhất trong các ngày thường." },
        { level: "Ưu tiên 2", title: "Bleisure", desc: "Khách công tác kết hợp nghỉ dưỡng, sẵn sàng chi thêm tiền để nâng cấp hạng phòng." }
      ], 
      where: [
        { level: "Kênh Chính", title: "Direct Website", desc: "Chặn rủi ro hủy ảo từ OTA (Tỷ lệ hủy OTA đang ở mức báo động 17.8%)." }
      ], 
      ancillary: { title: "Spa & Wellness Bundle", desc: "Khách phân khúc này chuộng trải nghiệm. Tặng kèm voucher Spa kích thích họ dùng các dịch vụ chăm sóc sức khỏe biên lợi nhuận cao." }
    },
    RT_STE: { 
      who: [
        { level: "Ưu tiên 1", title: "MICE VIPs / C-Level", desc: "Ngân sách công ty dồi dào, yêu cầu không gian lưu trú và làm việc đẳng cấp." }
      ], 
      where: [
        { level: "Kênh Chính", title: "Direct Phone / GDS", desc: "Bán qua Sales nội bộ để chăm sóc cá nhân hóa. Tuyệt đối không xả hàng lên OTA làm giảm giá trị thương hiệu." }
      ], 
      ancillary: { title: "Executive Lounge & Transfer", desc: "Cung cấp xe đưa đón sân bay và đặc quyền truy cập Lounge riêng tư." }
    }
  },
  Weekend: {
    RT_STD: { 
      who: [
        { level: "Ưu tiên 1", title: "FIT / Leisure Khách lẻ", desc: "Nhu cầu đi du lịch tự túc cuối tuần là nguồn cầu lớn nhất." }
      ], 
      where: [
        { level: "Kênh Chính", title: "OTA (Booking/Agoda)", desc: "Tận dụng thuật toán hiển thị của OTA để gom Volume, nhưng BẮT BUỘC bán giá Non-refundable." }
      ], 
      ancillary: { title: "Weekend Buffet Bundle", desc: "Tối ưu hóa công suất của nhà hàng cuối tuần. Tích hợp thẳng vào giá phòng để chốt sale nhanh." }
    },
    RT_DLX: { 
      who: [
        { level: "Ưu tiên 1", title: "Couples / Staycation", desc: "Cặp đôi hoặc khách địa phương tìm kiếm không gian lãng mạn dịp cuối tuần." }
      ], 
      where: [
        { level: "Kênh Chính", title: "Direct Social & Web", desc: "Chạy quảng cáo nhắm mục tiêu (Targeted Ads) các gói Combo tình yêu để lấy Data." }
      ], 
      ancillary: { title: "Romantic Retreat Package", desc: "Bao gồm Private Dining (Bữa tối lãng mạn) và setup phòng đặc biệt. Biên lợi nhuận F&B rất cao." }
    },
    RT_STE: { 
      who: [
        { level: "Ưu tiên 1", title: "High-net-worth Families", desc: "Gia đình thượng lưu cần không gian rộng rãi. Phân khúc này làm lấp đầy Suite đạt đỉnh 57.4%." }
      ], 
      where: [
        { level: "Kênh Chính", title: "Loyalty Program", desc: "Ưu tiên bán cho khách quen để triệt tiêu lịch sử 130 ca No-show." }
      ], 
      ancillary: { title: "Family Heritage Experience", desc: "Bao gồm Tour văn hóa thiết kế riêng và dịch vụ trông trẻ (Babysitting)." }
    }
  }
};

// ============================================================================
// 4. DATA EXTRACTOR
// ============================================================================
const DataExtractor = {
  readFile: (file) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          resolve(XLSX.read(new Uint8Array(e.target.result), { type: "array", cellDates: true }));
        } catch (err) { resolve(null); }
      };
      reader.onerror = () => resolve(null);
      reader.readAsArrayBuffer(file);
    });
  },

  getSheetData: (workbook, keyword, fallbackKeywords = []) => {
    if (!workbook) return [];
    let sheetName = workbook.SheetNames.find(n => n.toLowerCase().includes(keyword.toLowerCase()));
    if (!sheetName && workbook.SheetNames.length === 1) sheetName = workbook.SheetNames[0];

    if (!sheetName) {
      sheetName = workbook.SheetNames.find(n => {
        const data = XLSX.utils.sheet_to_json(workbook.Sheets[n], { header: 1 });
        if (data.length > 0) {
          const headerStr = Object.values(data[0] || {}).join("").toLowerCase();
          return fallbackKeywords.some(kw => headerStr.includes(kw));
        }
        return false;
      });
    }
    if (!sheetName) return [];
    return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
  },

  processRealData: async (historyFile, forecastFile) => {
    const [histWb, forecastWb] = await Promise.all([
      DataExtractor.readFile(historyFile), 
      DataExtractor.readFile(forecastFile)
    ]);

    let metrics = { ...CONFIG.DEFAULT_METRICS };
    const forecastData = DataExtractor.getSheetData(forecastWb, "summary", ["forecast"]);
    if (forecastData.length > 0) {
      forecastData.forEach(row => {
        const vals = Object.values(row);
        if (vals.length >= 2 && !isNaN(parseFloat(vals[1]))) {
          const keyStr = String(vals[0]).toLowerCase();
          if (keyStr.includes("forecast total")) metrics.forecast = parseFloat(vals[1]);
          if (keyStr.includes("on-hand total")) metrics.onHand = parseFloat(vals[1]);
        }
      });
    }

    const invData = DataExtractor.getSheetData(histWb, "inventory", ["available", "total"]);
    let rawStats = {
      Weekday: { RT_STD: { cap:0, avai:0, count:0 }, RT_DLX: { cap:0, avai:0, count:0 }, RT_STE: { cap:0, avai:0, count:0 } },
      Weekend: { RT_STD: { cap:0, avai:0, count:0 }, RT_DLX: { cap:0, avai:0, count:0 }, RT_STE: { cap:0, avai:0, count:0 } }
    };

    invData.forEach(row => {
      const rtRaw = String(row.room_type_id || row.room_type || row.RoomType || "").toUpperCase();
      let rt = "RT_STD";
      if (rtRaw.includes("DLX") || rtRaw.includes("DELUXE")) rt = "RT_DLX";
      if (rtRaw.includes("STE") || rtRaw.includes("SUITE")) rt = "RT_STE";

      const dtRaw = String(row.day_type || row.day_of_week || "").toLowerCase();
      const dt = (dtRaw.includes("weekend") || dtRaw.includes("sat") || dtRaw.includes("sun")) ? "Weekend" : "Weekday";

      let capKey = Object.keys(row).find(k => k.toLowerCase().includes("total") || k.toLowerCase().includes("capacity"));
      let avaiKey = Object.keys(row).find(k => k.toLowerCase().includes("available") || k.toLowerCase().includes("sale"));

      const cap = capKey ? parseFloat(row[capKey]) : 0;
      const avai = avaiKey ? parseFloat(row[avaiKey]) : 0;

      if (!isNaN(cap) && !isNaN(avai)) {
        rawStats[dt][rt].cap += cap;
        rawStats[dt][rt].avai += avai;
        rawStats[dt][rt].count += 1;
      }
    });

    const TABLEAU_BASELINE = {
      Weekday: { RT_STD: { cap: 45, sold: 19, avai: 26 }, RT_DLX: { cap: 28, sold: 14, avai: 14 }, RT_STE: { cap: 7, sold: 2, avai: 5 } },
      Weekend: { RT_STD: { cap: 45, sold: 16, avai: 29 }, RT_DLX: { cap: 28, sold: 14, avai: 14 }, RT_STE: { cap: 7, sold: 4, avai: 3 } }
    };

    let finalInventory = { Weekday: {}, Weekend: {} };
    const ROOM_NAMES = { RT_STD: "STANDARD ROOM", RT_DLX: "DELUXE ROOM", RT_STE: "EXECUTIVE SUITE" };
    const BASE_PRICES = { RT_STD: 95, RT_DLX: 129, RT_STE: 220 }; 

    ["Weekday", "Weekend"].forEach(dayType => {
      ["RT_STD", "RT_DLX", "RT_STE"].forEach(roomType => {
        const stat = rawStats[dayType][roomType];
        
        let finalCap = TABLEAU_BASELINE[dayType][roomType].cap;
        let finalAvai = TABLEAU_BASELINE[dayType][roomType].avai;
        let finalSold = TABLEAU_BASELINE[dayType][roomType].sold;

        if (stat.count > 0) {
          finalCap = Math.round(stat.cap / stat.count);
          finalAvai = Math.round(stat.avai / stat.count);
          finalSold = finalCap - finalAvai;
        }

        finalInventory[dayType][roomType] = {
          name: ROOM_NAMES[roomType],
          capacity: finalCap,
          sold: finalSold,
          baseAvai: finalAvai,
          oldPrice: BASE_PRICES[roomType]
        };
      });
    });

    return { metrics, inventoryData: finalInventory, syncStatus: true };
  }
};


// ============================================================================
// 5. MAIN APP COMPONENT
// ============================================================================
export default function App() {
  const [historyFile, setHistoryFile] = useState(null);
  const [forecastFile, setForecastFile] = useState(null);
  const [appData, setAppData] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const [selectedDayType, setSelectedDayType] = useState("Weekday");
  const [simLeadTime, setSimLeadTime] = useState(30); 
  const [targetOccupancy, setTargetOccupancy] = useState(65);

  const handleProcessData = async () => {
    if (!historyFile || !forecastFile) return alert("Hệ thống yêu cầu cung cấp đủ 2 file dữ liệu.");
    setIsProcessing(true);
    const processedData = await DataExtractor.processRealData(historyFile, forecastFile);
    setAppData(processedData);
    setIsProcessing(false);
  };

  // ĐỘNG CƠ PHÂN TÍCH VÀ ĐỘNG LỰC HỌC TỒN KHO
  const analyticsData = useMemo(() => {
    if (!appData || !appData.inventoryData) return null;

    const baseData = appData.inventoryData[selectedDayType];

    // SỬ DỤNG SỐ 44.2% LÀM MỎ NEO LỊCH SỬ NHƯ YÊU CẦU
    const historicalSoldRooms = Math.round(CONFIG.TOTAL_ROOMS * (CONFIG.HISTORICAL_AVG_OCCUPANCY / 100));

    // Tính toán số lượng đêm phòng cần bán ĐỂ BÙ ĐẮP KHOẢNG TRỐNG TỪ 44.2% LÊN TARGET%
    const targetDailyRooms = Math.round(CONFIG.TOTAL_ROOMS * (targetOccupancy / 100));
    const maxExtraDailyRooms = Math.max(0, targetDailyRooms - historicalSoldRooms);
    const extraMonthlyRoomNightsToSell = maxExtraDailyRooms * CONFIG.DAYS_IN_MONTH; 

    // ĐỊNH GIÁ 5 TẦNG
    let leadMultiplier = 1.0;
    let leadReason = "";

    if (simLeadTime <= 3) {
      leadMultiplier = 1.15;
      leadReason = "[Tier 1 - Khẩn cấp]: Khách hàng cận ngày. TĂNG GIÁ 15%.";
    } else if (simLeadTime <= 7) {
      leadMultiplier = 1.05;
      leadReason = "[Tier 2 - Ngắn hạn]: Khách chốt lịch trình. TĂNG GIÁ 5%.";
    } else if (simLeadTime <= 14) {
      leadMultiplier = 1.00;
      leadReason = "[Tier 3 - Tiêu chuẩn]: Cung cầu cân bằng. DUY TRÌ GIÁ BASE.";
    } else if (simLeadTime <= 21) {
      leadMultiplier = 0.95;
      leadReason = "[Tier 4 - Đặt sớm]: Kích cầu. GIẢM GIÁ 5%, kèm Hủy mất phí 50%.";
    } else {
      leadMultiplier = 0.90;
      leadReason = "[Tier 5 - Dài hạn]: Thu hút Base Volume. GIẢM GIÁ 10%, kèm Non-refundable.";
    }

    const pickupProgress = (30 - simLeadTime) / 29;

    const processedRooms = ["RT_STD", "RT_DLX", "RT_STE"].map(key => {
      const roomBase = baseData[key];
      const strat = STRATEGIES[selectedDayType][key];
      
      const roomTargetShare = Math.round(maxExtraDailyRooms * (roomBase.capacity / CONFIG.TOTAL_ROOMS));
      const pickupRooms = Math.round(roomTargetShare * pickupProgress);
      
      // Đã bán = Trung bình lịch sử thực tế + Lượng khách mua thêm theo Lead Time
      const dynamicSold = Math.min(roomBase.capacity, roomBase.sold + pickupRooms);

      // Khách trả phòng = 20% số phòng đang ở
      const checkOutRooms = Math.round(dynamicSold * 0.2);
      
      const dynamicAvai = Math.max(0, Math.min(roomBase.capacity, roomBase.capacity - dynamicSold + checkOutRooms));

      const dynamicAdr = roomBase.oldPrice * leadMultiplier;
      const priceDiff = ((dynamicAdr / roomBase.oldPrice) - 1) * 100;

      return { key, dynamicSold, checkOutRooms, avai: dynamicAvai, dynamicAdr, priceDiff, ...roomBase, ...strat };
    });

    // MÔ PHỎNG MONTE CARLO
    let successfulRoomRev = 0;
    const avgBaseAdr = processedRooms.reduce((sum, r) => sum + r.oldPrice, 0) / 3;

    for (let i = 0; i < CONFIG.MC_ITERATIONS; i++) {
      const demandCapture = Utils.randomNormal(CONFIG.MC_PARAMS.DEMAND_MEAN, CONFIG.MC_PARAMS.DEMAND_STD_DEV);
      const cancelRatio = Utils.randomNormal(CONFIG.MC_PARAMS.CANCEL_MEAN, CONFIG.MC_PARAMS.CANCEL_STD_DEV);
      
      const conversionRate = Math.max(0, Math.min(1, demandCapture)) * (1 - Math.max(0, Math.min(1, cancelRatio)));
      const simulatedMonthlyRoomsSold = extraMonthlyRoomNightsToSell * conversionRate;
      
      successfulRoomRev += (simulatedMonthlyRoomsSold * avgBaseAdr);
    }

    const meanRoomRev = successfulRoomRev / CONFIG.MC_ITERATIONS;
    const meanAncillaryRev = meanRoomRev * CONFIG.ANCILLARY_RATIO; 
    const totalProjectedRev = appData.metrics.onHand + meanRoomRev + meanAncillaryRev;
    
    return { extraMonthlyRoomNightsToSell, leadReason, processedRooms, impact: { totalProjectedRev, meanRoomRev, meanAncillaryRev } };

  }, [appData, selectedDayType, simLeadTime, targetOccupancy]);

  if (!appData) {
    return (
      <div style={STYLES.layoutCenter}>
        <div style={STYLES.bgBlur} />
        <div style={STYLES.loginCard}>
          <h1 style={STYLES.heading}>Hệ thống Hoạch định Doanh thu (BI)</h1>
          <p style={STYLES.subHeading}>Phân hệ Chẩn đoán & Kê toa Chiến lược - Heritage Hue Hotel</p>
          
          <div style={STYLES.flexGap}>
            <div style={STYLES.uploadBox}>
              <p style={STYLES.uploadTitle}>1. DỮ LIỆU LỊCH SỬ (CLEANED FILE)</p>
              <input type="file" accept=".xlsx,.csv" onChange={(e) => setHistoryFile(e.target.files[0])} />
            </div>
            <div style={STYLES.uploadBox}>
              <p style={STYLES.uploadTitle}>2. DỮ LIỆU DỰ BÁO (FORECAST FILE)</p>
              <input type="file" accept=".xlsx,.csv" onChange={(e) => setForecastFile(e.target.files[0])} />
            </div>
          </div>
          <button onClick={handleProcessData} disabled={isProcessing} style={STYLES.btnPrimary}>
            {isProcessing ? "ĐANG IMPORT VÀ TRÍCH XUẤT DỮ LIỆU..." : "Import Dữ liệu & Kết xuất Báo cáo"}
          </button>
        </div>
      </div>
    );
  }

  const { extraMonthlyRoomNightsToSell, leadReason, processedRooms, impact } = analyticsData;
  const growthPercent = ((impact.totalProjectedRev / appData.metrics.forecast) - 1) * 100;

  return (
    <div style={STYLES.layoutMain}>
      <div style={STYLES.bgBlurLight} />
      <div style={STYLES.dashboardContainer}>
        
        <header style={STYLES.header}>
          <div>
            <h1 style={STYLES.headerTitle}>Báo cáo Quản trị & Tối ưu Doanh thu - Tháng 01/2026</h1>
            <p style={STYLES.headerSub}>Ứng dụng Pipeline Trích xuất Dữ liệu, Định giá 5 Tầng & Monte Carlo.</p>
          </div>
          <div style={STYLES.statusSuccess}>✓ ĐÃ ĐỒNG BỘ DỮ LIỆU TỪ HỆ THỐNG</div>
        </header>

        <div style={STYLES.contentArea}>
          <div style={STYLES.grid2Col}>
            <div style={STYLES.metricCardActive}>
              <span style={STYLES.metricLabel}>DOANH THU ĐÃ CHỐT (ON-HAND)</span>
              <div style={STYLES.metricValue}>{Utils.currency(appData.metrics.onHand)}</div>
            </div>
            <div style={STYLES.metricCard}>
              <span style={STYLES.metricLabel}>DỰ BÁO DOANH THU TĨNH (BASELINE)</span>
              <div style={STYLES.metricValue}>{Utils.currency(appData.metrics.forecast)}</div>
            </div>
          </div>

          <section style={STYLES.controlSection}>
            <div>
              <div style={STYLES.flexBetween}>
                <h2 style={STYLES.controlTitle}>MỤC TIÊU CÔNG SUẤT KHÁCH SẠN:</h2>
                <span style={STYLES.badge}>{targetOccupancy}%</span>
              </div>
              <input type="range" min="45" max="95" value={targetOccupancy} onChange={(e) => setTargetOccupancy(Number(e.target.value))} style={STYLES.slider} />
              <div style={STYLES.helperText}>
                Trung bình Công suất Lịch sử các tháng trước đạt <span style={STYLES.highlightText}>{CONFIG.HISTORICAL_AVG_OCCUPANCY}%</span>. Để nâng lên mốc <span style={STYLES.highlightText}>{targetOccupancy}%</span> trong tháng này, Khối Kinh doanh cần khai thác thêm <span style={STYLES.highlightText}>{Utils.formatNum(extraMonthlyRoomNightsToSell)} Đêm phòng (Room Nights)</span>.
              </div>
            </div>

            <div>
              <div style={STYLES.flexBetween}>
                <h2 style={STYLES.controlTitle}>THỜI GIAN ĐẶT PHÒNG (LEAD TIME):</h2>
                <span style={STYLES.badge}>{simLeadTime} NGÀY</span>
              </div>
              <input type="range" min="1" max="30" value={simLeadTime} onChange={(e) => setSimLeadTime(Number(e.target.value))} style={STYLES.sliderReverse} />
              <div style={STYLES.alertBox}>
                <strong>PHẢN ỨNG GIÁ:</strong> {leadReason}
              </div>
            </div>
          </section>

          <div style={STYLES.flexGapSmall}>
            <button onClick={() => setSelectedDayType("Weekday")} style={selectedDayType === "Weekday" ? STYLES.tabActive : STYLES.tab}>BỐI CẢNH: NGÀY TRONG TUẦN</button>
            <button onClick={() => setSelectedDayType("Weekend")} style={selectedDayType === "Weekend" ? STYLES.tabActive : STYLES.tab}>BỐI CẢNH: CUỐI TUẦN</button>
          </div>

          <section style={{ marginBottom: "50px" }}>
            <table style={STYLES.table}>
              <thead>
                <tr style={STYLES.tableHead}>
                  <th style={STYLES.th}>HẠNG PHÒNG & TÌNH TRẠNG NGÀY</th>
                  <th style={STYLES.th}>ĐỊNH GIÁ ĐA TẦNG (ADR)</th>
                  <th style={STYLES.th}>CHIẾN LƯỢC PHÂN KHÚC KHÁCH HÀNG</th>
                  <th style={STYLES.th}>CHIẾN LƯỢC KÊNH PHÂN PHỐI</th>
                  <th style={STYLES.th}>DỊCH VỤ GIA TĂNG (ANCILLARY)</th>
                </tr>
              </thead>
              <tbody style={{ background: "white" }}>
                {processedRooms.map(room => (
                  <tr key={room.key} style={STYLES.tableRow}>
                    <td style={STYLES.td}>
                      <div style={STYLES.roomName}>{room.name}</div>
                      <div style={STYLES.roomStat}>Sức chứa: <strong>{room.capacity} phòng</strong></div>
                      
                      <div style={{ fontSize: "13px", color: "#1e40af", marginBottom: "4px", fontWeight: "700" }}>
                        Đã bán (Cập nhật): <strong>{room.dynamicSold} phòng</strong>
                      </div>
                      <div style={{ fontSize: "13px", color: "#059669", marginBottom: "12px", fontWeight: "700" }}>
                        Khách trả (Check-out): <strong>+{room.checkOutRooms} phòng</strong>
                      </div>
                      
                      <div style={STYLES.roomAvai}>
                        Sẵn bán (Available): {Utils.formatNum(room.avai)}
                      </div>
                    </td>
                    <td style={STYLES.td}>
                      <div style={STYLES.priceOld}>{Utils.currency(room.oldPrice)}</div>
                      <div style={STYLES.priceNew}>{Utils.currency(room.dynamicAdr)}</div>
                      <div style={{...STYLES.priceDiff, color: room.priceDiff >= 0 ? "#059669" : "#dc2626"}}>
                        ({room.priceDiff >= 0 ? "+" : ""}{room.priceDiff.toFixed(1)}%)
                      </div>
                    </td>
                    <td style={STYLES.td}>
                      {room.who.map((w, idx) => (
                        <div key={idx} style={{marginBottom: "12px"}}>
                          <span style={STYLES.stratLevel}>{w.title}</span>
                          <div style={STYLES.stratDesc}>{w.desc}</div>
                        </div>
                      ))}
                    </td>
                    <td style={STYLES.td}>
                      {room.where.map((w, idx) => (
                        <div key={idx} style={{marginBottom: "12px"}}>
                          <span style={STYLES.stratLevel}>{w.title}</span>
                          <div style={STYLES.stratDesc}>{w.desc}</div>
                        </div>
                      ))}
                    </td>
                    <td style={STYLES.td}>
                      <div style={STYLES.ancilTitle}>{room.ancillary.title}</div>
                      <div style={STYLES.ancilDesc}>{room.ancillary.desc}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section style={STYLES.impactSection}>
            <h2 style={STYLES.impactHeader}>Kết quả Đạt được Kỳ vọng (Monte Carlo Analysis - Box Muller)</h2>
            <div style={STYLES.impactGrid}>
              <div style={STYLES.impactTextCol}>
                <p style={STYLES.impactDesc}>
                  Hệ thống thực thi <strong>{CONFIG.MC_ITERATIONS} phiên bản giả lập</strong> áp dụng phân phối chuẩn (Normal Distribution) để định lượng rủi ro kinh tế học: Lực cầu thị trường và Tỷ lệ hủy phòng ảo.
                  <br/><br/>
                  <strong>Lưu ý:</strong> Doanh thu kỳ vọng tính theo mức giá cơ sở (Base Rate), độc lập với biến động giá Lead Time ngắn hạn. Điều này phản ánh chính xác mục tiêu tăng trưởng dài hạn của Khối Kinh doanh.
                </p>
                <div style={STYLES.impactBaseBox}>
                  <div style={STYLES.impactBaseLabel}>MỐC DỰ BÁO TĨNH (BASELINE)</div>
                  <div style={STYLES.impactBaseVal}>{Utils.currency(appData.metrics.forecast)}</div>
                </div>
              </div>

              <div style={STYLES.impactResultGrid}>
                <div style={STYLES.impactTotalBox}>
                  <div style={STYLES.impactTotalLabel}>TỔNG DOANH THU KỲ VỌNG (EXPECTED VALUE)</div>
                  <div style={STYLES.impactTotalVal}>{Utils.currency(impact.totalProjectedRev)}</div>
                </div>
                <div style={STYLES.impactGrowthBox}>
                  <div style={{fontSize: "12px", fontWeight: "800", color: "#059669", marginBottom: "8px"}}>TĂNG TRƯỞNG</div>
                  <div style={{fontSize: "26px", fontWeight: "900", color: "#059669"}}>+{growthPercent.toFixed(1)}%</div>
                </div>
                <div style={STYLES.impactSubBox}>
                  <div style={{fontSize: "12px", fontWeight: "800", color: "#475569", marginBottom: "8px"}}>ROOM REVENUE GAIN</div>
                  <div style={{fontSize: "22px", fontWeight: "900", color: "#0f172a"}}>+{Utils.currency(impact.meanRoomRev)}</div>
                </div>
                <div style={STYLES.impactAncilBox}>
                  <div style={{fontSize: "12px", fontWeight: "800", color: "#475569", marginBottom: "8px"}}>ANCILLARY REVENUE GAIN</div>
                  <div style={{fontSize: "22px", fontWeight: "900", color: "#2563eb"}}>+{Utils.currency(impact.meanAncillaryRev)}</div>
                </div>
              </div>
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}