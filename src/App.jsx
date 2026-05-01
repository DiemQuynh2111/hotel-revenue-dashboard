import React, { useState, useMemo } from "react";
import * as XLSX from "xlsx";

// ============================================================================
// 1. CẤU HÌNH & STYLES
// ============================================================================
const CONFIG = {
  MC_ITERATIONS: 2000,
  DAYS_IN_MONTH: 31,
  TOTAL_ROOMS: 80,
  HISTORICAL_AVG_OCCUPANCY: 44.2, 
  ANCILLARY_RATIO: 0.18,
  MC_PARAMS: { DEMAND_MEAN: 0.85, DEMAND_STD_DEV: 0.05, CANCEL_MEAN: 0.10, CANCEL_STD_DEV: 0.02 },
  DEFAULT_METRICS: { forecast: 125494, onHand: 110744 },
  DAYS_WEEKDAY: 22,
  DAYS_WEEKEND: 9
};

const STYLES = {
  layoutCenter: { minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: "20px", fontFamily: "system-ui, sans-serif" },
  bgBlur: { position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", background: "#f8fafc", zIndex: -1 },
  loginCard: { background: "white", padding: "50px", width: "100%", maxWidth: "800px", borderTop: "4px solid #1e3a8a", boxShadow: "0 20px 40px rgba(0,0,0,0.1)", borderRadius: "8px" },
  heading: { color: "#0f172a", margin: "0 0 10px 0", fontSize: "26px", fontWeight: "900", textTransform: "uppercase" },
  subHeading: { color: "#64748b", margin: "0 0 30px 0", fontSize: "14px", lineHeight: "1.6" },
  flexGap: { display: "flex", gap: "20px", marginBottom: "30px" },
  uploadBox: { flex: 1, border: "1px solid #cbd5e1", padding: "25px 20px", background: "#f1f5f9", borderRadius: "6px" },
  uploadTitle: { fontSize: "12px", fontWeight: "800", color: "#1e3a8a", margin: "0 0 12px 0" },
  btnPrimary: { background: "#1e3a8a", color: "white", padding: "18px", border: "none", cursor: "pointer", fontWeight: "800", width: "100%", fontSize: "14px", borderRadius: "6px" },
  
  layoutMain: { minHeight: "100vh", padding: "30px 20px", fontFamily: "system-ui, sans-serif", color: "#0f172a" },
  bgBlurLight: { position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", background: "#f1f5f9", zIndex: -1 },
  dashboardContainer: { maxWidth: "1550px", margin: "0 auto", background: "white", boxShadow: "0 10px 40px rgba(0,0,0,0.08)", border: "1px solid #e2e8f0", borderRadius: "10px", overflow: "hidden" },
  header: { background: "#0f172a", padding: "30px 40px", color: "white", borderBottom: "4px solid #1e3a8a", display: "flex", justifyContent: "space-between", alignItems: "center" },
  headerTitle: { fontSize: "22px", fontWeight: "900", textTransform: "uppercase", margin: "0 0 8px 0" },
  headerSub: { margin: 0, color: "#94a3b8", fontSize: "13px" },
  statusSuccess: { padding: "8px 16px", background: "#059669", color: "white", fontWeight: "800", fontSize: "12px", borderRadius: "6px" },
  contentArea: { padding: "40px" },
  
  grid2Col: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "25px", marginBottom: "35px" },
  metricCardActive: { padding: "25px", border: "1px solid #cbd5e1", background: "#f8fafc", borderLeft: "5px solid #1e3a8a", borderRadius: "6px" },
  metricCard: { padding: "25px", border: "1px solid #cbd5e1", background: "white", borderLeft: "5px solid #64748b", borderRadius: "6px" },
  metricLabel: { fontSize: "12px", color: "#475569", fontWeight: "800" },
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
  
  table: { width: "100%", borderCollapse: "collapse", border: "1px solid #cbd5e1", background: "white", borderRadius: "8px", overflow: "hidden", tableLayout: "fixed" },
  tableHead: { textAlign: "left", background: "#f1f5f9", borderBottom: "3px solid #1e3a8a" },
  th: { padding: "18px 20px", fontSize: "12px", color: "#1e3a8a", textTransform: "uppercase", fontWeight: "900" },
  tableRow: { borderBottom: "1px solid #e2e8f0" },
  td: { padding: "25px 20px", verticalAlign: "top" },
  
  roomName: { fontWeight: "900", color: "#0f172a", fontSize: "15px", marginBottom: "12px" },
  roomStat: { fontSize: "13px", color: "#64748b", marginBottom: "6px" },
  roomAvai: { fontSize: "13px", fontWeight: "800", color: "#1e3a8a", padding: "8px 12px", background: "#eff6ff", border: "1px solid #bfdbfe", display: "inline-block", marginTop: "6px", borderRadius: "6px" },
  priceOld: { fontSize: "14px", color: "#94a3b8", textDecoration: "line-through", fontWeight: "600" },
  priceNew: { fontSize: "24px", fontWeight: "900", color: "#0f172a", margin: "6px 0" },
  priceDiff: { fontSize: "13px", fontWeight: "800" },
  
  stratSection: { marginBottom: "16px", paddingBottom: "12px", borderBottom: "1px dashed #e2e8f0" },
  stratLevel: { display: "inline-block", padding: "4px 8px", background: "#f1f5f9", color: "#334155", fontSize: "11px", fontWeight: "800", borderRadius: "4px", marginBottom: "6px" },
  stratTitle: { fontSize: "13px", fontWeight: "800", color: "#0f172a", marginBottom: "6px" },
  stratDesc: { fontSize: "13px", color: "#475569", lineHeight: "1.6", margin: 0, textAlign: "justify" },
  
  ancilTitle: { fontSize: "13px", fontWeight: "900", color: "#1d4ed8", marginBottom: "6px" },
  ancilDesc: { fontSize: "13px", color: "#475569", lineHeight: "1.6", fontStyle: "italic", textAlign: "justify" },
  
  impactSection: { border: "1px solid #cbd5e1", background: "white", borderRadius: "8px", overflow: "hidden" },
  impactHeader: { fontSize: "16px", fontWeight: "900", color: "#0f172a", background: "#f1f5f9", margin: 0, padding: "20px 30px", borderBottom: "1px solid #e2e8f0" },
  impactGrid: { padding: "40px", display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "40px" },
  impactTextCol: { borderRight: "1px solid #e2e8f0", paddingRight: "40px" },
  impactDesc: { fontSize: "14px", color: "#475569", lineHeight: "1.8", margin: "0 0 25px 0", textAlign: "justify" },
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
// 3. CHIẾN LƯỢC KINH DOANH (LIÊN KẾT 100% VỚI PHÂN TÍCH CHẨN ĐOÁN)
// ============================================================================
const STRATEGIES = {
  Weekday: {
    RT_STD: { 
      who: [
        { level: "Ưu tiên 1", title: "Corporate (B2B)", desc: "Giảm rủi ro tập trung vào Leisure (62%). Nhóm công tác đóng vai trò Base Volume giúp duy trì công suất 14 lượt/ngày cho Weekday." },
        { level: "Ưu tiên 2", title: "Group (> 6 đêm)", desc: "Phân tích cho thấy khách lưu trú >6 đêm có mức chi tiêu phụ trợ vượt trội. Cần khai thác để tối ưu hóa RevPAR." }
      ], 
      where: [
        { level: "Kênh Chính", title: "Corporate Contract", desc: "Kênh B2B có Net ADR tương đương OTA nhưng không mất hoa hồng. Giúp giải quyết bài toán Volume vs Net Value." },
        { level: "Rào cản", title: "Siết hoàn hủy Group", desc: "Dữ liệu báo động nhóm Group có tỷ lệ hủy lên tới 18%. Bắt buộc thu cọc 50% trước 15 ngày." }
      ], 
      ancillary: { title: "Dịch vụ: F&B Bundle", desc: "Doanh thu bổ trợ đi ngang vào tháng 1. Weekday khách chuộng F&B/Tour, cần ghép bữa ăn vào giá phòng để chốt doanh thu trước (Pre-arrival)." }
    },
    RT_DLX: { 
      who: [
        { level: "Ưu tiên 1", title: "Leisure (Nghỉ dưỡng)", desc: "Dù là Weekday, Leisure vẫn là tệp mang lại ADR và RevPAR cao nhất. Tối ưu bán Deluxe để tăng Value-driven." }
      ], 
      where: [
        { level: "Kênh Chính", title: "Direct - Website", desc: "Chuyển dịch tệp Leisure từ OTA sang Direct nhằm cải thiện Net ADR. Yêu cầu thẻ tín dụng đảm bảo để giảm 12.2% tỷ lệ hủy trên web." }
      ], 
      ancillary: { title: "Dịch vụ: Spa & Tour Upsell", desc: "Doanh thu bổ trợ đang lệ thuộc F&B (52%). Tặng voucher Tour Weekday cho phòng Deluxe để san sẻ tỷ trọng doanh thu." }
    },
    RT_STE: { 
      who: [
        { level: "Ưu tiên 1", title: "MICE VIPs", desc: "Tệp khách tỷ lệ hủy thấp nhất. Phân khúc này có khả năng lấp đầy phòng Suite ở mức giá trần." }
      ], 
      where: [
        { level: "Kênh Chính", title: "Direct Phone/Walk-in", desc: "Bán qua Sales nội bộ. Tuyệt đối không đẩy Suite lên OTA để bảo vệ thương hiệu và tránh chi phí hoa hồng." }
      ], 
      ancillary: { title: "Dịch vụ: Business Premium", desc: "Chẩn đoán chỉ ra khách Suite hiện chi tiêu Ancillary bằng Standard. Cần mồi thêm gói Dịch vụ giặt ủi/Đưa đón." }
    }
  },
  Weekend: {
    RT_STD: { 
      who: [
        { level: "Ưu tiên 1", title: "Leisure Khách lẻ", desc: "Weekend lượng booking giảm 1 nửa nhưng giá trị phòng lại cao hơn Weekday. Tập trung tệp khách này để giữ giá." }
      ], 
      where: [
        { level: "Kênh Chính", title: "OTA (Booking/Agoda)", desc: "OTA đang bào mòn doanh thu do hủy phòng cao (17.8%). Vẫn dùng OTA kéo Volume cuối tuần nhưng BẮT BUỘC áp giá Non-refundable." }
      ], 
      ancillary: { title: "Dịch vụ: Weekend Buffet", desc: "Kích thích F&B nội khu. Tháng 1 Ancillary đã bão hòa booking cũ, phải chủ động bán kèm suất ăn khi khách check-in." }
    },
    RT_DLX: { 
      who: [
        { level: "Ưu tiên 1", title: "Couples / Staycation", desc: "Nhóm khách chịu chi. Bù đắp sự sụt giảm volume booking từ 14 (ngày thường) xuống 6.5 (cuối tuần)." }
      ], 
      where: [
        { level: "Kênh Chính", title: "Direct Social & Web", desc: "Tận dụng tập khách hàng địa phương, đẩy quảng cáo Combo qua kênh Direct để tối đa hóa biên lợi nhuận ròng." }
      ], 
      ancillary: { title: "Dịch vụ: Spa Retreat", desc: "Phân tích chỉ ra Spa là dịch vụ tiêu tiền mạnh nhất dịp cuối tuần. Đẩy mạnh Cross-sell Spa ngay lúc đặt phòng." }
    },
    RT_STE: { 
      who: [
        { level: "Ưu tiên 1", title: "Gia đình Thượng lưu", desc: "Tận dụng hiệu ứng mùa vụ cuối tuần giúp lấp đầy Suite đạt đỉnh 57.4%." }
      ], 
      where: [
        { level: "Kênh Chính", title: "Loyalty Program", desc: "Khai thác Data khách hàng cũ. Chặn đứng 130 ca No-show từ khách lạ bằng cách bán qua chương trình thành viên." }
      ], 
      ancillary: { title: "Dịch vụ: Trải nghiệm Cục bộ", desc: "Bán kèm các hoạt động thư giãn tại khách sạn nhằm tăng tỷ trọng nhóm dịch vụ Other (hiện đang cực thấp)." }
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

    const rnData = DataExtractor.getSheetData(histWb, "night", ["stay", "room_type"]);
    let rawSold = { Weekday: { RT_STD: 0, RT_DLX: 0, RT_STE: 0 }, Weekend: { RT_STD: 0, RT_DLX: 0, RT_STE: 0 } };

    const resData = DataExtractor.getSheetData(histWb, "reservation", ["departure"]);
    let rawCheckouts = { Weekday: { RT_STD: 0, RT_DLX: 0, RT_STE: 0 }, Weekend: { RT_STD: 0, RT_DLX: 0, RT_STE: 0 } };

    let syncStatus = false;

    rnData.forEach(row => {
      let isTargetMonth = false;
      for (let key in row) {
        const val = row[key];
        if (val instanceof Date && val.getFullYear() === 2026 && val.getMonth() === 0) isTargetMonth = true;
        else if (typeof val === 'string' && (val.includes("2026-01") || val.includes("2026/01") || val.includes("1/2026"))) isTargetMonth = true;
      }
      if (isTargetMonth) {
        const status = String(row.occupancy_status || "").toLowerCase();
        if (!status.includes("cancel")) {
          syncStatus = true;
          const rtRaw = String(row.room_type_id || row.room_type || "").toUpperCase();
          let rt = "RT_STD";
          if (rtRaw.includes("DLX") || rtRaw.includes("DELUXE")) rt = "RT_DLX";
          if (rtRaw.includes("STE") || rtRaw.includes("SUITE")) rt = "RT_STE";
          const dtRaw = String(row.day_type || "").toLowerCase();
          const dt = (dtRaw.includes("weekend") || dtRaw.includes("sat") || dtRaw.includes("sun")) ? "Weekend" : "Weekday";
          rawSold[dt][rt] += parseFloat(row.room_night_qty || row.qty || 1);
        }
      }
    });

    resData.forEach(row => {
      let isTargetMonth = false;
      let depDateObj = null;

      if (row.departure_date instanceof Date) {
        depDateObj = row.departure_date;
        if (depDateObj.getFullYear() === 2026 && depDateObj.getMonth() === 0) isTargetMonth = true;
      } else if (typeof row.departure_date === 'string' && row.departure_date.includes("2026-01")) {
        isTargetMonth = true;
        depDateObj = new Date(row.departure_date);
      } else if (typeof row.DepartureDate === 'string' && row.DepartureDate.includes("2026-01")) {
        isTargetMonth = true;
        depDateObj = new Date(row.DepartureDate);
      }

      const status = String(row.status || row.Status || "").toLowerCase();
      const isCancelled = row.is_cancelled == 1 || status.includes("cancel");

      if (isTargetMonth && !isCancelled) {
        const rtRaw = String(row.room_type_id || row.room_type || "").toUpperCase();
        let rt = "RT_STD";
        if (rtRaw.includes("DLX") || rtRaw.includes("DELUXE")) rt = "RT_DLX";
        if (rtRaw.includes("STE") || rtRaw.includes("SUITE")) rt = "RT_STE";

        let dayOfWeek = depDateObj ? depDateObj.getDay() : 1; 
        const dt = (dayOfWeek === 0 || dayOfWeek === 6) ? "Weekend" : "Weekday";
        const roomsBooked = parseFloat(row.rooms_booked || row.RoomsBooked || 1);
        
        rawCheckouts[dt][rt] += roomsBooked;
      }
    });

    let finalInventory = { Weekday: {}, Weekend: {} };
    const CAPACITIES = { RT_STD: 45, RT_DLX: 28, RT_STE: 7 };
    const ROOM_NAMES = { RT_STD: "STANDARD ROOM", RT_DLX: "DELUXE ROOM", RT_STE: "EXECUTIVE SUITE" };
    const BASE_PRICES = { RT_STD: 95, RT_DLX: 129, RT_STE: 220 }; 

    ["Weekday", "Weekend"].forEach(dayType => {
      ["RT_STD", "RT_DLX", "RT_STE"].forEach(roomType => {
        const divider = dayType === "Weekday" ? CONFIG.DAYS_WEEKDAY : CONFIG.DAYS_WEEKEND;
        const avgSold = Math.round(rawSold[dayType][roomType] / divider);
        const avgCheckouts = Math.round(rawCheckouts[dayType][roomType] / divider);
        const capacity = CAPACITIES[roomType];

        finalInventory[dayType][roomType] = {
          name: ROOM_NAMES[roomType],
          capacity: capacity,
          baseSold: syncStatus ? avgSold : (roomType === "RT_STD" ? 18 : roomType === "RT_DLX" ? 12 : 3),
          baseCheckOuts: syncStatus ? avgCheckouts : (roomType === "RT_STD" ? 4 : roomType === "RT_DLX" ? 2 : 1),
          oldPrice: BASE_PRICES[roomType]
        };
      });
    });

    return { metrics, inventoryData: finalInventory, syncStatus };
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

  const analyticsData = useMemo(() => {
    if (!appData || !appData.inventoryData) return null;

    const baseData = appData.inventoryData[selectedDayType];

    const targetDailyRooms = Math.round(CONFIG.TOTAL_ROOMS * (targetOccupancy / 100));
    const historicalSoldRooms = Math.round(CONFIG.TOTAL_ROOMS * (CONFIG.HISTORICAL_AVG_OCCUPANCY / 100));
    const maxExtraDailyRooms = Math.max(0, targetDailyRooms - historicalSoldRooms);
    const extraMonthlyRoomNightsToSell = maxExtraDailyRooms * CONFIG.DAYS_IN_MONTH; 

    // ĐỊNH GIÁ ĐỘNG THEO LÝ THUYẾT PHÂN TÍCH
    let leadMultiplier = 1.0;
    let leadReason = "";

    if (simLeadTime <= 3) {
      leadMultiplier = 1.15;
      leadReason = "[Tier 1 - Khẩn cấp]: Nhu cầu vọt lên sát ngày check-in. Khuyến nghị TĂNG GIÁ 15% (Tránh áp dụng cho OTA để giảm rủi ro Leakage).";
    } else if (simLeadTime <= 7) {
      leadMultiplier = 1.05;
      leadReason = "[Tier 2 - Ngắn hạn]: Khách hàng đã chốt lịch trình. Khuyến nghị TĂNG GIÁ 5% (Phù hợp bán qua Direct Web).";
    } else if (simLeadTime <= 14) {
      leadMultiplier = 1.00;
      leadReason = "[Tier 3 - Tiêu chuẩn]: Cung cầu cân bằng. Mức giá chưa phản ứng mạnh với Demand. DUY TRÌ GIÁ BASE.";
    } else if (simLeadTime <= 21) {
      leadMultiplier = 0.95;
      leadReason = "[Tier 4 - Đặt sớm]: Ưu đãi kích cầu. GIẢM GIÁ 5%, kèm rào cản hoàn hủy chặt chẽ (Phạt 50%) để chống Hủy.";
    } else {
      leadMultiplier = 0.90;
      leadReason = "[Tier 5 - Dài hạn]: Thời gian đặt quá xa dễ đổi ý định. GIẢM GIÁ 10%, BẮT BUỘC Non-refundable 100% để bảo vệ dòng tiền.";
    }

    const pickupProgress = (30 - simLeadTime) / 29;

    const processedRooms = ["RT_STD", "RT_DLX", "RT_STE"].map(key => {
      const roomBase = baseData[key];
      const strat = STRATEGIES[selectedDayType][key];
      
      const roomTargetShare = Math.round(maxExtraDailyRooms * (roomBase.capacity / CONFIG.TOTAL_ROOMS));
      const pickupRooms = Math.round(roomTargetShare * pickupProgress);
      
      // Data Động lực học Tồn kho thực tế
      const dynamicSold = Math.min(roomBase.capacity, roomBase.baseSold + pickupRooms);
      const checkOutRooms = Math.round(roomBase.baseCheckOuts + (pickupRooms * (roomBase.baseCheckOuts / (roomBase.baseSold || 1))));
      const dynamicAvai = Math.max(0, Math.min(roomBase.capacity, roomBase.capacity - dynamicSold + checkOutRooms));

      const dynamicAdr = roomBase.oldPrice * leadMultiplier;
      const priceDiff = ((dynamicAdr / roomBase.oldPrice) - 1) * 100;

      return { key, dynamicSold, checkOutRooms, avai: dynamicAvai, dynamicAdr, priceDiff, ...roomBase, ...strat };
    });

    let successfulRoomRev = 0;
    const avgDynamicAdr = processedRooms.reduce((sum, r) => sum + r.dynamicAdr, 0) / 3;

    for (let i = 0; i < CONFIG.MC_ITERATIONS; i++) {
      const demandCapture = Utils.randomNormal(CONFIG.MC_PARAMS.DEMAND_MEAN, CONFIG.MC_PARAMS.DEMAND_STD_DEV);
      const cancelRatio = Utils.randomNormal(CONFIG.MC_PARAMS.CANCEL_MEAN, CONFIG.MC_PARAMS.CANCEL_STD_DEV);
      
      const conversionRate = Math.max(0, Math.min(1, demandCapture)) * (1 - Math.max(0, Math.min(1, cancelRatio)));
      const simulatedMonthlyRoomsSold = extraMonthlyRoomNightsToSell * conversionRate;
      
      successfulRoomRev += (simulatedMonthlyRoomsSold * avgDynamicAdr);
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
          <p style={STYLES.subHeading}>Giải pháp Kê toa (Prescriptive Analytics): Khắc phục việc chạy theo Volume, giảm phụ thuộc OTA, kiểm soát Tỷ lệ Hủy ảo và Khai phá Ancillary Revenue.</p>
          <div style={STYLES.flexGap}>
            <div style={STYLES.uploadBox}>
              <p style={STYLES.uploadTitle}>1. DỮ LIỆU LỊCH SỬ (ROOM NIGHTS FILE)</p>
              <input type="file" accept=".xlsx,.csv" onChange={(e) => setHistoryFile(e.target.files[0])} />
            </div>
            <div style={STYLES.uploadBox}>
              <p style={STYLES.uploadTitle}>2. DỮ LIỆU DỰ BÁO (FORECAST FILE)</p>
              <input type="file" accept=".xlsx,.csv" onChange={(e) => setForecastFile(e.target.files[0])} />
            </div>
          </div>
          <button onClick={handleProcessData} disabled={isProcessing} style={STYLES.btnPrimary}>
            {isProcessing ? "ĐANG IMPORT VÀ TRÍCH XUẤT DỮ LIỆU..." : "Import Dữ liệu & Kết xuất Báo cáo Kê toa"}
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
            <h1 style={STYLES.headerTitle}>Báo cáo Quản trị & Kê toa Chiến lược - Tháng 01/2026</h1>
            <p style={STYLES.headerSub}>Tái cân bằng Kênh phân phối, Định giá theo Demand & Tối ưu hóa Doanh thu bổ trợ.</p>
          </div>
          <div style={appData.syncStatus ? STYLES.statusSuccess : { ...STYLES.statusSuccess, background: "#b45309", borderColor: "#92400e" }}>
             {appData.syncStatus ? "✓ ĐÃ ĐỒNG BỘ DỮ LIỆU FILE" : "⚠️ KHÔNG TÌM THẤY T1/2026 - DÙNG BASELINE"}
          </div>
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
                Trung bình Công suất Lịch sử chỉ đạt <span style={STYLES.highlightText}>{CONFIG.HISTORICAL_AVG_OCCUPANCY}%</span>. Để lấp đầy khoảng trống dự báo tháng 1 và kéo công suất lên mức <span style={STYLES.highlightText}>{targetOccupancy}%</span>, Khối Kinh doanh cần bán thêm <span style={STYLES.highlightText}>{Utils.formatNum(extraMonthlyRoomNightsToSell)} Đêm phòng (Room Nights)</span>.
              </div>
            </div>

            <div>
              <div style={STYLES.flexBetween}>
                <h2 style={STYLES.controlTitle}>THỜI GIAN ĐẶT PHÒNG (LEAD TIME):</h2>
                <span style={STYLES.badge}>{simLeadTime} NGÀY</span>
              </div>
              <input type="range" min="1" max="30" value={simLeadTime} onChange={(e) => setSimLeadTime(Number(e.target.value))} style={STYLES.sliderReverse} />
              <div style={STYLES.alertBox}>
                <strong>PHẢN ỨNG GIÁ TỐI ƯU:</strong> {leadReason}
              </div>
            </div>
          </section>

          <div style={STYLES.flexGapSmall}>
            <button onClick={() => setSelectedDayType("Weekday")} style={selectedDayType === "Weekday" ? STYLES.tabActive : STYLES.tab}>BỐI CẢNH: NGÀY TRONG TUẦN (WEEKDAY)</button>
            <button onClick={() => setSelectedDayType("Weekend")} style={selectedDayType === "Weekend" ? STYLES.tabActive : STYLES.tab}>BỐI CẢNH: CUỐI TUẦN (WEEKEND)</button>
          </div>

          <section style={{ marginBottom: "50px" }}>
            <table style={STYLES.table}>
              <colgroup>
                <col style={{width: "16%"}} />
                <col style={{width: "12%"}} />
                <col style={{width: "25%"}} />
                <col style={{width: "25%"}} />
                <col style={{width: "22%"}} />
              </colgroup>
              <thead>
                <tr style={STYLES.tableHead}>
                  <th style={STYLES.th}>HẠNG PHÒNG & TỒN KHO</th>
                  <th style={STYLES.th}>GIÁ ĐỀ XUẤT (ADR)</th>
                  <th style={STYLES.th}>CHIẾN LƯỢC PHÂN KHÚC (SEGMENTS)</th>
                  <th style={STYLES.th}>CHIẾN LƯỢC KÊNH (CHANNELS)</th>
                  <th style={STYLES.th}>DỊCH VỤ GIA TĂNG (ANCILLARY)</th>
                </tr>
              </thead>
              <tbody style={{ background: "white" }}>
                {processedRooms.map(room => (
                  <tr key={room.key} style={STYLES.tableRow}>
                    <td style={STYLES.td}>
                      <div style={STYLES.roomName}>{room.name}</div>
                      <div style={STYLES.roomStat}>Sức chứa: <strong>{room.capacity} phòng</strong></div>
                      <div style={{ fontSize: "12px", color: "#1e40af", marginBottom: "4px", fontWeight: "700" }}>Đã bán: <strong>{room.dynamicSold} phòng</strong></div>
                      <div style={{ fontSize: "12px", color: "#059669", marginBottom: "12px", fontWeight: "700" }}>Khách trả: <strong>+{room.checkOutRooms} phòng</strong></div>
                      <div style={STYLES.roomAvai}>Sẵn bán: {Utils.formatNum(room.avai)}</div>
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
                        <div key={idx} style={STYLES.stratSection}>
                          <span style={STYLES.stratLevel}>{w.level}</span>
                          <div style={STYLES.stratTitle}>{w.title}</div>
                          <div style={STYLES.stratDesc}>{w.desc}</div>
                        </div>
                      ))}
                    </td>
                    <td style={STYLES.td}>
                      {room.where.map((w, idx) => (
                        <div key={idx} style={STYLES.stratSection}>
                          <span style={STYLES.stratLevel}>{w.level}</span>
                          <div style={STYLES.stratTitle}>{w.title}</div>
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
            <h2 style={STYLES.impactHeader}>Kết quả Đạt được Kỳ vọng (Dynamic Monte Carlo Analysis)</h2>
            <div style={STYLES.impactGrid}>
              <div style={STYLES.impactTextCol}>
                <p style={STYLES.impactDesc}>
                  Hệ thống thực thi <strong>{CONFIG.MC_ITERATIONS} phiên bản giả lập</strong> áp dụng phân phối chuẩn để định lượng rủi ro kinh tế học: Lực cầu thị trường biến thiên và Tỷ lệ hủy phòng ảo (Leakage).
                  <br/><br/>
                  <strong>Tái mô phỏng Động (Dynamic Resimulation):</strong> Mức Doanh thu Kỳ vọng sẽ phản ứng tức thời với mức giá (ADR) được điều chỉnh theo thời gian Lead Time. Áp dụng bảng chiến lược ở trên sẽ giúp khách sạn khắc phục tình trạng tăng trưởng Volume ảo, từ đó tối ưu Net Value thực tế.
                </p>
                <div style={STYLES.impactBaseBox}>
                  <div style={STYLES.impactBaseLabel}>MỐC DỰ BÁO TĨNH (BASELINE)</div>
                  <div style={STYLES.impactBaseVal}>{Utils.currency(appData.metrics.forecast)}</div>
                </div>
              </div>

              <div style={STYLES.impactResultGrid}>
                <div style={STYLES.impactTotalBox}>
                  <div style={STYLES.impactTotalLabel}>TỔNG DOANH THU KỲ VỌNG ĐẠT ĐƯỢC</div>
                  <div style={STYLES.impactTotalVal}>{Utils.currency(impact.totalProjectedRev)}</div>
                </div>
                <div style={STYLES.impactGrowthBox}>
                  <div style={{fontSize: "12px", fontWeight: "800", color: "#059669", marginBottom: "8px"}}>TĂNG TRƯỞNG</div>
                  <div style={{fontSize: "26px", fontWeight: "900", color: "#059669"}}>+{growthPercent.toFixed(1)}%</div>
                </div>
                <div style={STYLES.impactSubBox}>
                  <div style={{fontSize: "12px", fontWeight: "800", color: "#475569", marginBottom: "8px"}}>TỪ DOANH THU PHÒNG</div>
                  <div style={{fontSize: "22px", fontWeight: "900", color: "#0f172a"}}>+{Utils.currency(impact.meanRoomRev)}</div>
                </div>
                <div style={STYLES.impactAncilBox}>
                  <div style={{fontSize: "12px", fontWeight: "800", color: "#475569", marginBottom: "8px"}}>TỪ DỊCH VỤ BỔ TRỢ (ANCILLARY)</div>
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